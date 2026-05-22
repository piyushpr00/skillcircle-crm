const { pool } = require('./db');

const NOTIFICATION_MINUTES = [5, 3]; // Send notifications 5 and 3 minutes before

async function checkAndSendNotifications() {
  try {
    for (const minutesBefore of NOTIFICATION_MINUTES) {
      // Calculate the time window for this notification
      const now = new Date();
      const notificationTime = new Date(now.getTime() + minutesBefore * 60 * 1000);

      // Get today's date in YYYY-MM-DD format
      const todayDate = now.toISOString().split('T')[0];
      const notificationDate = notificationTime.toISOString().split('T')[0];

      // Only notify if the follow-up is today
      if (notificationDate !== todayDate) continue;

      const currentHour = now.getHours().toString().padStart(2, '0');
      const currentMinute = now.getMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHour}:${currentMinute}`;

      const notificationHour = notificationTime.getHours().toString().padStart(2, '0');
      const notificationMinute = notificationTime.getMinutes().toString().padStart(2, '0');
      const targetTime = `${notificationHour}:${notificationMinute}`;

      // Find remarks that should trigger a notification
      const { rows: remarks } = await pool.query(`
        SELECT r.id, r.remark, r.follow_up_date, r.client_id, c.name AS client_name
        FROM remarks r
        JOIN clients c ON r.client_id = c.id
        WHERE r.follow_up_date = $1
          AND NOT EXISTS (
            SELECT 1 FROM notifications
            WHERE remark_id = r.id AND minutes_before = $2
          )
        LIMIT 10
      `, [todayDate, minutesBefore]);

      for (const remark of remarks) {
        try {
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
