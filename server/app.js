require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool, init } = require('./db');
const { auth, adminOnly } = require('./middleware');
const authRouter = require('./auth');
const { getUnreadNotifications, startNotificationScheduler } = require('./notifications');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Public
app.use('/api/auth', authRouter);

// Protected
app.use('/api', auth);

// ── Clients ────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(r.id)::int AS remark_count
      FROM clients c LEFT JOIN remarks r ON r.client_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { rows: c } = await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
    if (!c[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: remarks } = await pool.query(
      'SELECT * FROM remarks WHERE client_id=$1 ORDER BY follow_up_date ASC NULLS LAST, created_at DESC',
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
      'INSERT INTO clients (name,number,email,location,budget) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, number||'', email||'', location||'', budget||'']
    );
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name, number, email, location, budget } = req.body;
    await pool.query(
      'UPDATE clients SET name=$1,number=$2,email=$3,location=$4,budget=$5 WHERE id=$6',
      [name, number, email, location, budget, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clients/:id', adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Remarks ────────────────────────────────────────────
app.post('/api/clients/:id/remarks', async (req, res) => {
  try {
    const { remark, follow_up_date, follow_up_time } = req.body;
    if (!remark) return res.status(400).json({ error: 'Remark required' });
    const { rows } = await pool.query(
      'INSERT INTO remarks (client_id,remark,follow_up_date,follow_up_time) VALUES ($1,$2,$3,$4) RETURNING id',
      [req.params.id, remark, follow_up_date||null, follow_up_time||'09:00:00']
    );
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/remarks/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM remarks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Follow-ups ─────────────────────────────────────────
app.get('/api/followups/today', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.number, c.email
      FROM remarks r JOIN clients c ON r.client_id=c.id
      WHERE r.follow_up_date=CURRENT_DATE
      ORDER BY r.follow_up_time ASC, c.name
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/followups/upcoming', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.number, c.email
      FROM remarks r JOIN clients c ON r.client_id=c.id
      WHERE r.follow_up_date>=CURRENT_DATE
      ORDER BY r.follow_up_date ASC, r.follow_up_time ASC LIMIT 50
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upload ─────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let clientCount = 0, remarkCount = 0;

    for (const row of rows) {
      const name = row['Name']||row['name']||row['CLIENT NAME']||row['Client Name']||'';
      if (!name) continue;

      // Insert client
      const { rows: clientRows } = await pool.query(
        'INSERT INTO clients (name,number,email,location,budget) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [name, String(row['Phone']||row['Number']||row['Mobile']||''),
         String(row['Email']||row['email']||''),
         String(row['Location']||row['location']||''),
         String(row['Budget']||row['budget']||'')]
      );
      const clientId = clientRows[0].id;
      clientCount++;

      // Parse date columns and create remarks
      // Date columns will have format like "19/5/2026", "20/5/2026", etc.
      const dateRegex = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

      for (const [key, value] of Object.entries(row)) {
        // Check if column header is a date
        if (dateRegex.test(key) && value && String(value).trim()) {
          try {
            // Parse date string (e.g., "19/5/2026" -> "2026-05-19")
            const [day, month, year] = key.split('/');
            const followUpDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

            // Insert remark with follow-up date
            await pool.query(
              'INSERT INTO remarks (client_id, remark, follow_up_date, follow_up_time) VALUES ($1, $2, $3, $4)',
              [clientId, String(value).trim(), followUpDate, '09:00:00']
            );
            remarkCount++;
          } catch (err) {
            console.error(`Error processing remark for ${name} on ${key}:`, err.message);
          }
        }
      }
    }
    res.json({ imported: clientCount, remarks: remarkCount });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Notifications ──────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await getUnreadNotifications();
    res.json(notifications);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lazy DB init flag for serverless
let _ready = false;
app.dbInit = async () => {
  if (!_ready) {
    await init();
    startNotificationScheduler();
    _ready = true;
  }
};

module.exports = app;
