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
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List users (admin only)
router.get('/users', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at ASC'
  );
  res.json(rows);
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
