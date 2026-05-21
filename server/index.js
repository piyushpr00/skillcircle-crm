require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool, init } = require('./db');
const { auth, adminOnly } = require('./middleware');
const authRouter = require('./auth');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Public auth routes
app.use('/api/auth', authRouter);

// All routes below require a valid JWT
app.use('/api', auth);

// ── Clients ────────────────────────────────────────────

app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(r.id)::int AS remark_count
      FROM clients c
      LEFT JOIN remarks r ON r.client_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { rows: c } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!c[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: remarks } = await pool.query(
      'SELECT * FROM remarks WHERE client_id = $1 ORDER BY follow_up_date ASC NULLS LAST, created_at DESC',
      [req.params.id]
    );
    res.json({ ...c[0], remarks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { name, number, email, location, budget } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO clients (name, number, email, location, budget) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, number || '', email || '', location || '', budget || '']
    );
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name, number, email, location, budget } = req.body;
    await pool.query(
      'UPDATE clients SET name=$1, number=$2, email=$3, location=$4, budget=$5 WHERE id=$6',
      [name, number, email, location, budget, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete client — admin only
app.delete('/api/clients/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Remarks ────────────────────────────────────────────

app.post('/api/clients/:id/remarks', async (req, res) => {
  try {
    const { remark, follow_up_date } = req.body;
    if (!remark) return res.status(400).json({ error: 'Remark is required' });
    const { rows } = await pool.query(
      'INSERT INTO remarks (client_id, remark, follow_up_date) VALUES ($1,$2,$3) RETURNING id',
      [req.params.id, remark, follow_up_date || null]
    );
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/remarks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM remarks WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Follow-ups ─────────────────────────────────────────

app.get('/api/followups/today', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.number, c.email
      FROM remarks r
      JOIN clients c ON r.client_id = c.id
      WHERE r.follow_up_date = CURRENT_DATE
      ORDER BY c.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/followups/upcoming', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.number, c.email
      FROM remarks r
      JOIN clients c ON r.client_id = c.id
      WHERE r.follow_up_date >= CURRENT_DATE
      ORDER BY r.follow_up_date ASC
      LIMIT 50
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Excel / CSV Upload ─────────────────────────────────

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let count = 0;
    for (const row of rows) {
      const name = row['Name'] || row['name'] || row['CLIENT NAME'] || row['Client Name'] || '';
      if (!name) continue;
      await pool.query(
        'INSERT INTO clients (name, number, email, location, budget) VALUES ($1,$2,$3,$4,$5)',
        [
          name,
          String(row['Number'] || row['number'] || row['Phone'] || row['Mobile'] || ''),
          String(row['Email'] || row['email'] || ''),
          String(row['Location'] || row['location'] || ''),
          String(row['Budget'] || row['budget'] || ''),
        ]
      );
      count++;
    }
    res.json({ imported: count });
  } catch (e) {
    res.status(400).json({ error: 'Failed to parse file: ' + e.message });
  }
});

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
