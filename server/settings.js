const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { auth, adminOnly } = require('./middleware');

const router = express.Router();

// ========== USER PREFERENCES ENDPOINTS ==========

// Get user preferences
router.get('/profile/preferences', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );
    if (rows.length === 0) {
      // Create default preferences if not exists
      const { rows: newRows } = await pool.query(
        `INSERT INTO user_preferences (user_id, theme, timezone, language, date_format, time_format, first_day_of_week)
         VALUES ($1, 'light', 'IST', 'en', 'DD/MM/YYYY', '24h', 1)
         RETURNING *`,
        [req.user.id]
      );
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user preferences
router.put('/profile/preferences', auth, async (req, res) => {
  try {
    const { theme, timezone, language, date_format, time_format, first_day_of_week } = req.body;
    const { rows } = await pool.query(
      `UPDATE user_preferences
       SET theme = COALESCE($1, theme),
           timezone = COALESCE($2, timezone),
           language = COALESCE($3, language),
           date_format = COALESCE($4, date_format),
           time_format = COALESCE($5, time_format),
           first_day_of_week = COALESCE($6, first_day_of_week),
           updated_at = NOW()
       WHERE user_id = $7
       RETURNING *`,
      [theme, timezone, language, date_format, time_format, first_day_of_week, req.user.id]
    );
    if (rows.length === 0) {
      // Create if doesn't exist
      const { rows: newRows } = await pool.query(
        `INSERT INTO user_preferences (user_id, theme, timezone, language, date_format, time_format, first_day_of_week)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.id, theme || 'light', timezone || 'IST', language || 'en', date_format || 'DD/MM/YYYY', time_format || '24h', first_day_of_week || 1]
      );
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== NOTIFICATION PREFERENCES ENDPOINTS ==========

// Get notification preferences
router.get('/profile/notifications', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [req.user.id]
    );
    if (rows.length === 0) {
      // Create default notification preferences if not exists
      const { rows: newRows } = await pool.query(
        `INSERT INTO notification_preferences (user_id, email_notifications, sound_notifications, browser_notifications,
         followup_15min, followup_10min, followup_5min, followup_3min)
         VALUES ($1, true, true, true, true, true, true, true)
         RETURNING *`,
        [req.user.id]
      );
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update notification preferences
router.put('/profile/notifications', auth, async (req, res) => {
  try {
    const {
      email_notifications, sound_notifications, browser_notifications,
      followup_15min, followup_10min, followup_5min, followup_3min,
      mute_start_time, mute_end_time, mute_weekends
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE notification_preferences
       SET email_notifications = COALESCE($1, email_notifications),
           sound_notifications = COALESCE($2, sound_notifications),
           browser_notifications = COALESCE($3, browser_notifications),
           followup_15min = COALESCE($4, followup_15min),
           followup_10min = COALESCE($5, followup_10min),
           followup_5min = COALESCE($6, followup_5min),
           followup_3min = COALESCE($7, followup_3min),
           mute_start_time = $8,
           mute_end_time = $9,
           mute_weekends = COALESCE($10, mute_weekends),
           updated_at = NOW()
       WHERE user_id = $11
       RETURNING *`,
      [email_notifications, sound_notifications, browser_notifications,
       followup_15min, followup_10min, followup_5min, followup_3min,
       mute_start_time, mute_end_time, mute_weekends, req.user.id]
    );

    if (rows.length === 0) {
      // Create if doesn't exist
      const { rows: newRows } = await pool.query(
        `INSERT INTO notification_preferences (user_id, email_notifications, sound_notifications, browser_notifications,
         followup_15min, followup_10min, followup_5min, followup_3min, mute_start_time, mute_end_time, mute_weekends)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [req.user.id, email_notifications ?? true, sound_notifications ?? true, browser_notifications ?? true,
         followup_15min ?? true, followup_10min ?? true, followup_5min ?? true, followup_3min ?? true,
         mute_start_time, mute_end_time, mute_weekends ?? false]
      );
      return res.json(newRows[0]);
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== PROFILE (NAME, EMAIL, PHONE, BIO) ENDPOINTS ==========

// Get profile info
router.get('/profile/info', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, full_name, phone, bio, created_at, last_login FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update profile (name, email, phone, bio)
router.put('/profile/info', auth, async (req, res) => {
  try {
    const { full_name, email, phone, bio } = req.body;
    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           bio = COALESCE($4, bio),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, username, email, full_name, phone, bio, created_at, last_login`,
      [full_name, email, phone, bio, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SECURITY ENDPOINTS ==========

// Change password
router.put('/profile/password', auth, async (req, res) => {
  try {
    const { current, next } = req.body;
    if (!current || !next) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (next.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const { rows: userRows } = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!userRows[0] || !(await bcrypt.compare(current, userRows[0].password))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(next, 10);
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get active sessions
router.get('/profile/sessions', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, ip_address, user_agent, login_at, expires_at FROM login_sessions WHERE user_id = $1 AND logout_at IS NULL ORDER BY login_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout specific session
router.delete('/profile/sessions/:id', auth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    // Verify session belongs to user
    const { rows: sessionRows } = await pool.query(
      'SELECT user_id FROM login_sessions WHERE id = $1',
      [sessionId]
    );
    if (!sessionRows[0] || sessionRows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Cannot logout other users sessions' });
    }

    await pool.query(
      'UPDATE login_sessions SET logout_at = NOW() WHERE id = $1',
      [sessionId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ACTIVITY LOG ENDPOINTS ==========

// Get user activity log
router.get('/profile/activity-log', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action, ip_address, created_at FROM user_activity_log
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== DATA EXPORT ENDPOINTS ==========

// Export user data
router.get('/profile/export-data', auth, async (req, res) => {
  try {
    // Get user info
    const { rows: userRows } = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.id]
    );

    // Get all clients assigned to user
    const { rows: clientRows } = await pool.query(
      'SELECT * FROM clients WHERE assigned_to = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    // Get all remarks for these clients
    let remarks = [];
    if (clientRows.length > 0) {
      const clientIds = clientRows.map(c => c.id);
      const { rows: remarkRows } = await pool.query(
        'SELECT * FROM remarks WHERE client_id = ANY($1) ORDER BY created_at DESC',
        [clientIds]
      );
      remarks = remarkRows;
    }

    // Get activity log
    const { rows: activityRows } = await pool.query(
      'SELECT * FROM user_activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );

    // Compile export data
    const exportData = {
      exportDate: new Date().toISOString(),
      user: userRows[0],
      clients: clientRows,
      remarks: remarks,
      activityLog: activityRows
    };

    // Send as JSON download
    res.json(exportData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== ADMIN ENDPOINTS ==========

// Admin: Get system audit log
router.get('/admin/audit-log', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ual.id, ual.user_id, u.username, ual.action, ual.ip_address, ual.created_at
       FROM user_activity_log ual
       LEFT JOIN users u ON ual.user_id = u.id
       ORDER BY ual.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get user settings
router.get('/admin/settings/users/:id/preferences', auth, adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { rows: prefs } = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    const { rows: notifs } = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    res.json({ preferences: prefs[0], notifications: notifs[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Update user settings
router.put('/admin/settings/users/:id/preferences', auth, adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { preferences, notifications } = req.body;

    if (preferences) {
      await pool.query(
        `UPDATE user_preferences
         SET theme = COALESCE($1, theme),
             timezone = COALESCE($2, timezone),
             language = COALESCE($3, language),
             date_format = COALESCE($4, date_format),
             time_format = COALESCE($5, time_format),
             updated_at = NOW()
         WHERE user_id = $6`,
        [preferences.theme, preferences.timezone, preferences.language,
         preferences.date_format, preferences.time_format, userId]
      );
    }

    if (notifications) {
      await pool.query(
        `UPDATE notification_preferences
         SET email_notifications = COALESCE($1, email_notifications),
             sound_notifications = COALESCE($2, sound_notifications),
             browser_notifications = COALESCE($3, browser_notifications),
             followup_15min = COALESCE($4, followup_15min),
             followup_10min = COALESCE($5, followup_10min),
             followup_5min = COALESCE($6, followup_5min),
             followup_3min = COALESCE($7, followup_3min),
             updated_at = NOW()
         WHERE user_id = $8`,
        [notifications.email_notifications, notifications.sound_notifications,
         notifications.browser_notifications, notifications.followup_15min,
         notifications.followup_10min, notifications.followup_5min,
         notifications.followup_3min, userId]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
