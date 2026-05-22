const { pool } = require('./db');

const NOTIFICATION_MINUTES = [5, 3]; // Send notifications 5 and 3 minutes before

async function checkAndSendNotifications() {
  try {
    for (const minutesBefore of NOTIFICATION_MINUTES) {
      // Get current UTC time
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const currentTime = `${hours}:${minutes}`;

      // Get today's date in YYYY-MM-DD format (UTC)
      const todayDate = now.toISOString().split('T')[0];

      // Find remarks that should trigger a notification
      // Check if follow-up time is within the notification window (±30 seconds from target time)
      const { rows: remarks } = await pool.query(`
        SELECT r.id, r.remark, r.follow_up_date, r.follow_up_time, r.client_id, c.name AS client_name
        FROM remarks r
        JOIN clients c ON r.client_id = c.id
        WHERE r.follow_up_date = $1
          AND r.follow_up_time IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (r.follow_up_time - CAST($2 AS TIME))) - ($3 * 60)) < 30
          AND NOT EXISTS (
            SELECT 1 FROM notifications
            WHERE remark_id = r.id AND minutes_before = $4
          )
        LIMIT 10
      `, [todayDate, currentTime, minutesBefore, minutesBefore]);

      console.log(`[NOTIFICATION CHECK] Date: ${todayDate}, Time: ${currentTime}, Minutes Before: ${minutesBefore}, Found: ${remarks.length}`);

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
