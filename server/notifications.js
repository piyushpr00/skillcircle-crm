const { pool } = require('./db');
const { sendNotificationEmail } = require('./email');

const NOTIFICATION_MINUTES = [15, 10, 5, 3]; // Send notifications 15, 10, 5 and 3 minutes before

// Helper function to check if notification should be sent based on user preferences
async function shouldSendNotification(userId, minutesBefore, followUpTime) {
  try {
    // Get user's notification preferences
    const { rows: notifPrefs } = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );

    if (notifPrefs.length === 0) {
      // Default: send all notifications if no preferences set
      return true;
    }

    const prefs = notifPrefs[0];

    // Check if this specific timing is enabled
    const timingMap = {
      15: prefs.followup_15min,
      10: prefs.followup_10min,
      5: prefs.followup_5min,
      3: prefs.followup_3min
    };

    if (!timingMap[minutesBefore]) {
      return false;
    }

    // Check quiet hours
    if (prefs.mute_start_time && prefs.mute_end_time) {
      const [followUpHours, followUpMins] = followUpTime.split(':').map(Number);
      const followUpMinutesOfDay = followUpHours * 60 + followUpMins;

      const [muteStartHours, muteStartMins] = prefs.mute_start_time.split(':').map(Number);
      const muteStartMinutesOfDay = muteStartHours * 60 + muteStartMins;

      const [muteEndHours, muteEndMins] = prefs.mute_end_time.split(':').map(Number);
      const muteEndMinutesOfDay = muteEndHours * 60 + muteEndMins;

      // Handle overnight quiet hours (e.g., 22:00 to 09:00)
      const inQuietHours = muteStartMinutesOfDay > muteEndMinutesOfDay
        ? (followUpMinutesOfDay >= muteStartMinutesOfDay || followUpMinutesOfDay < muteEndMinutesOfDay)
        : (followUpMinutesOfDay >= muteStartMinutesOfDay && followUpMinutesOfDay < muteEndMinutesOfDay);

      if (inQuietHours) {
        return false;
      }
    }

    // Check mute weekends
    if (prefs.mute_weekends) {
      const dayOfWeek = new Date().getDay(); // 0=Sunday, 6=Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error checking notification preferences:', err.message);
    return true; // Default to sending if there's an error
  }
}

async function checkAndSendNotifications() {
  try {
    for (const minutesBefore of NOTIFICATION_MINUTES) {
      // Get current UTC time and convert to IST (UTC+5:30)
      const now = new Date();

      // Convert UTC to IST by adding 5 hours 30 minutes
      const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const hours = String(istTime.getUTCHours()).padStart(2, '0');
      const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;

      // Get today's date in IST (YYYY-MM-DD)
      const year = istTime.getUTCFullYear();
      const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
      const date = String(istTime.getUTCDate()).padStart(2, '0');
      const todayDate = `${year}-${month}-${date}`;

      // Find remarks that should trigger a notification
      // Check if follow-up time is within the notification window (±30 seconds from target time)
      const { rows: remarks } = await pool.query(`
        SELECT r.id, r.remark, r.follow_up_date, r.follow_up_time, r.client_id, c.name AS client_name, c.assigned_to, u.email
        FROM remarks r
        JOIN clients c ON r.client_id = c.id
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE r.follow_up_date = $1
          AND r.follow_up_time IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (r.follow_up_time - CAST($2 AS TIME))) - ($3 * 60)) < 30
          AND NOT EXISTS (
            SELECT 1 FROM notifications
            WHERE remark_id = r.id AND minutes_before = $4
          )
        LIMIT 10
      `, [todayDate, currentTime, minutesBefore, minutesBefore]);

      console.log(`[NOTIFICATION CHECK] IST Time: ${currentTime}, Date: ${todayDate}, Minutes Before: ${minutesBefore}, Found: ${remarks.length}`);

      for (const remark of remarks) {
        try {
          // Check if user wants this notification
          const shouldSend = await shouldSendNotification(remark.assigned_to, minutesBefore, remark.follow_up_time);

          if (!shouldSend) {
            console.log(`[NOTIFICATION SKIPPED] User preferences prevent ${minutesBefore}min notification for remark ${remark.id}`);
            continue;
          }

          // Record the notification as sent
          await pool.query(`
            INSERT INTO notifications (remark_id, minutes_before, sent_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (remark_id, minutes_before) DO NOTHING
          `, [remark.id, minutesBefore]);

          // Log the notification for auditing
          const message = `Follow-up for ${remark.client_name}: ${remark.remark}`;
          await pool.query(`
            INSERT INTO notification_logs (remark_id, client_name, minutes_before, message)
            VALUES ($1, $2, $3, $4)
          `, [remark.id, remark.client_name, minutesBefore, message]);

          console.log(`[NOTIFICATION] ${minutesBefore}min before: ${message}`);

          // Get user's notification preferences
          const { rows: notifPrefs } = await pool.query(
            'SELECT * FROM notification_preferences WHERE user_id = $1',
            [remark.assigned_to]
          );
          const prefs = notifPrefs[0] || {};

          // Send email notification if user has email and has enabled email notifications
          if (remark.email && prefs.email_notifications !== false) {
            const followupDateTime = `${remark.follow_up_date} at ${remark.follow_up_time}`;
            await sendNotificationEmail(
              remark.email,
              remark.client_name,
              remark.remark,
              followupDateTime,
              minutesBefore
            );
          }
        } catch (err) {
          console.error(`Failed to record notification for remark ${remark.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error checking notifications:', err.message);
  }
}

async function getUnreadNotifications() {
  try {
    const { rows } = await pool.query(`
      SELECT nl.id, nl.remark_id, nl.client_name, nl.minutes_before, nl.message, nl.timestamp
      FROM notification_logs nl
      WHERE nl.timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY nl.timestamp DESC
      LIMIT 20
    `);
    return rows;
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    return [];
  }
}

async function clearOldNotifications() {
  try {
    // Clear notifications older than 24 hours
    await pool.query(`
      DELETE FROM notification_logs
      WHERE timestamp < NOW() - INTERVAL '24 hours'
    `);
  } catch (err) {
    console.error('Error clearing old notifications:', err.message);
  }
}

// Start notification scheduler
function startNotificationScheduler() {
  // Check every minute
  setInterval(() => {
    checkAndSendNotifications();
  }, 60000);

  // Clean up old notifications every hour
  setInterval(() => {
    clearOldNotifications();
  }, 60 * 60 * 1000);

  console.log('✓ Notification scheduler started (checks every minute)');
}

module.exports = {
  checkAndSendNotifications,
  getUnreadNotifications,
  clearOldNotifications,
  startNotificationScheduler,
};
