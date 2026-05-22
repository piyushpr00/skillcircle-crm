const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { auth, adminOnly } = require('./middleware');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'crm-dev-secret';

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled. Contact administrator.' });
    }
    // Update last login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Log activity
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
    await pool.query(
      'INSERT INTO user_activity_log (user_id, action, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      [user.id, 'login', ipAddress, userAgent]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );

    // Also create a login session record
    await pool.query(
      `INSERT INTO login_sessions (user_id, token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
      [user.id, token, ipAddress, userAgent]
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List users (admin only)
router.get('/users', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, email, full_name, role, created_at, last_login, is_active, updated_at FROM users ORDER BY created_at ASC'
  );
  res.json(rows);
});

// Get single user (admin only)
router.get('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, full_name, phone, department, position, address, city, state, country, postal_code, date_of_birth, joining_date, emergency_contact, emergency_phone, bio, role, created_at, last_login, is_active, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Edit user (admin only, can't edit self)
router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: "You can't edit your own account through admin panel" });
    }
    const {
      username, email, role, full_name, phone, department, position,
      address, city, state, country, postal_code, date_of_birth,
      joining_date, emergency_contact, emergency_phone, bio
    } = req.body;

    if (!username) return res.status(400).json({ error: 'Username is required' });

    // Check if username already exists (excluding current user)
    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET
        username = $1, email = $2, role = $3, full_name = $4, phone = $5,
        department = $6, position = $7, address = $8, city = $9, state = $10,
        country = $11, postal_code = $12, date_of_birth = $13, joining_date = $14,
        emergency_contact = $15, emergency_phone = $16, bio = $17, updated_at = NOW()
      WHERE id = $18
      RETURNING id, username, email, full_name, phone, department, position, address,
        city, state, country, postal_code, date_of_birth, joining_date,
        emergency_contact, emergency_phone, bio, role, created_at, last_login, is_active, updated_at`,
      [username, email || null, role || 'executive', full_name || null, phone || null,
       department || null, position || null, address || null, city || null, state || null,
       country || null, postal_code || null, date_of_birth || null, joining_date || null,
       emergency_contact || null, emergency_phone || null, bio || null, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reset user password (admin only, can't reset own)
router.put('/users/:id/password', auth, adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Use change password for your own account" });
    }
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role',
      [hash, userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: rows[0], message: 'Password reset successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Toggle user status (admin only, can't toggle own)
router.put('/users/:id/status', auth, adminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ error: "You can't disable your own account" });
    }
    const { rows } = await pool.query(
      'UPDATE users SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, username, is_active, email, role',
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create user (admin only)
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
      [username, hash, email || null, role || 'executive']
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Delete user (admin only, can't delete self)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Change own password
router.put('/password', auth, async (req, res) => {
  const { current, next } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(current, rows[0].password))) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }
  const hash = await bcrypt.hash(next, 10);
  await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
