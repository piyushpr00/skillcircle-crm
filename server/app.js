require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool, init } = require('./db');
const { auth, adminOnly } = require('./middleware');
const authRouter = require('./auth');
const settingsRouter = require('./settings');
const { getUnreadNotifications, startNotificationScheduler } = require('./notifications');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Public
app.use('/api/auth', authRouter);

// Protected
app.use('/api', auth);
app.use('/api', settingsRouter);

// ── Clients ────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(r.id)::int AS remark_count, u.username as assigned_user
      FROM clients c
      LEFT JOIN remarks r ON r.client_id = c.id
      LEFT JOIN users u ON c.assigned_to = u.id
      GROUP BY c.id, u.username ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const { rows: c } = await pool.query(
      'SELECT c.*, u.username as assigned_user FROM clients c LEFT JOIN users u ON c.assigned_to = u.id WHERE c.id=$1',
      [req.params.id]
    );
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
    const { name, number, email, location, assigned_to, initial_remark, follow_up_date, follow_up_time } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      'INSERT INTO clients (name,number,email,location,assigned_to) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, number||'', email||'', location||'', assigned_to||null]
    );
    const clientId = rows[0].id;

    // Add initial remark if provided
    if (initial_remark && initial_remark.trim()) {
      await pool.query(
        'INSERT INTO remarks (client_id,remark,follow_up_date,follow_up_time) VALUES ($1,$2,$3,$4)',
        [clientId, initial_remark, follow_up_date||null, follow_up_time||'09:00:00']
      );
    }

    res.json({ id: clientId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { name, number, email, location, assigned_to } = req.body;
    await pool.query(
      'UPDATE clients SET name=$1,number=$2,email=$3,location=$4,assigned_to=$5 WHERE id=$6',
      [name, number, email, location, assigned_to||null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Assign client to executive ─────────────────────────
app.patch('/api/clients/:id/assign', adminOnly, async (req, res) => {
  try {
    const { assigned_to } = req.body;
    if (!assigned_to) {
      return res.status(400).json({ error: 'assigned_to is required' });
    }
    await pool.query(
      'UPDATE clients SET assigned_to=$1 WHERE id=$2',
      [assigned_to, req.params.id]
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

app.get('/api/remarks', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.name AS client_name, c.number, c.email
      FROM remarks r JOIN clients c ON r.client_id=c.id
      ORDER BY r.follow_up_date DESC, r.follow_up_time DESC LIMIT 100
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Upload ─────────────────────────────────────────────
// Validation helpers
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validatePhone(phone) {
  const phoneRegex = /^\d+$/;
  return phoneRegex.test(phone);
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let clientCount = 0, remarkCount = 0;
    let errors = [];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const rowNum = rowIndex + 2; // Row number in Excel (1-indexed + header)

      // Get field values with multiple possible column names
      const name = String(row['Name']||row['name']||row['CLIENT NAME']||row['Client Name']||'').trim();
      const phone = String(row['Phone']||row['Number']||row['Mobile']||'').trim();
      const email = String(row['Email']||row['email']||'').trim();
      const location = String(row['Location']||row['location']||'').trim();

      // Validate required fields
      if (!name) {
        errors.push(`Row ${rowNum}: Name is required`);
        continue;
      }
      if (!phone) {
        errors.push(`Row ${rowNum}: Phone is required`);
        continue;
      }
      if (!location) {
        errors.push(`Row ${rowNum}: Location is required`);
        continue;
      }

      // Validate phone format (numbers only)
      if (!validatePhone(phone)) {
        errors.push(`Row ${rowNum}: Phone must contain only numbers (${phone})`);
        continue;
      }

      // Validate email format if provided (optional field, but must be valid if present)
      if (email && !validateEmail(email)) {
        errors.push(`Row ${rowNum}: Email format is invalid (${email})`);
        continue;
      }

      try {
        // Insert client
        const { rows: clientRows } = await pool.query(
          'INSERT INTO clients (name,number,email,location) VALUES ($1,$2,$3,$4) RETURNING id',
          [name, phone, email, location]
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
      } catch (err) {
        errors.push(`Row ${rowNum}: Database error - ${err.message}`);
      }
    }

    // Return results with any errors
    res.json({
      imported: clientCount,
      remarks: remarkCount,
      errors: errors,
      success: clientCount > 0,
      errorCount: errors.length
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Notifications ──────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    const notifications = await getUnreadNotifications();
    res.json(notifications);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Test Notification (for debugging) ───────────────
app.post('/api/test-notification', adminOnly, async (req, res) => {
  try {
    // Create a test follow-up for 2 minutes from now (in IST)
    const now = new Date();
    const futureTime = new Date(now.getTime() + 2 * 60000); // 2 minutes from now

    // Convert to IST (UTC+5:30) for storing in database
    const istTime = new Date(futureTime.getTime() + 5.5 * 60 * 60 * 1000);
    const hours = String(istTime.getUTCHours()).padStart(2, '0');
    const minutes = String(istTime.getUTCMinutes()).padStart(2, '0');
    const testTime = `${hours}:${minutes}:00`;

    // Get IST date
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const date = String(istTime.getUTCDate()).padStart(2, '0');
    const testDate = `${year}-${month}-${date}`;

    // Current IST time for display
    const currentIst = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const currentHours = String(currentIst.getUTCHours()).padStart(2, '0');
    const currentMinutes = String(currentIst.getUTCMinutes()).padStart(2, '0');
    const currentIstTime = `${currentHours}:${currentMinutes}`;

    // Create test client
    const { rows: clientRows } = await pool.query(
      'INSERT INTO clients (name, number, email) VALUES ($1, $2, $3) RETURNING id',
      ['TEST_CLIENT_' + Date.now(), '9999999999', 'test@test.com']
    );
    const clientId = clientRows[0].id;

    // Create test remark with follow-up in 2 minutes
    const { rows: remarkRows } = await pool.query(
      'INSERT INTO remarks (client_id, remark, follow_up_date, follow_up_time) VALUES ($1, $2, $3, $4) RETURNING id',
      [clientId, 'TEST NOTIFICATION - Check Recent Notifications panel in 2 mins', testDate, testTime]
    );

    res.json({
      success: true,
      message: 'Test follow-up created for IST timezone',
      clientId,
      remarkId: remarkRows[0].id,
      currentIstTime: currentIstTime + ' IST',
      testTime: testTime + ' IST',
      testDate: testDate,
      instruction: 'Go to Dashboard → Check "Recent Notifications" panel. Should appear in ~60-120 seconds.'
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Meetings ────────────────────────────────────────────
app.get('/api/meetings', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*, c.name as client_name, u.username as executive_name
      FROM meetings m
      LEFT JOIN clients c ON m.client_id = c.id
      LEFT JOIN users u ON c.assigned_to = u.id
      ORDER BY m.meeting_date ASC, m.meeting_time ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/meetings', async (req, res) => {
  try {
    const { client_id, title, description, meeting_date, meeting_time, duration, location } = req.body;
    if (!title || !client_id || !meeting_date || !meeting_time) {
      return res.status(400).json({ error: 'Title, client, date, and time are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO meetings (client_id, assigned_to, title, description, meeting_date, meeting_time, duration, location, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'scheduled')
       RETURNING *`,
      [client_id, req.user.id, title, description, meeting_date, meeting_time, duration || 30, location, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/meetings/:id', async (req, res) => {
  try {
    const { title, description, meeting_date, meeting_time, duration, location, status } = req.body;

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title !== undefined) { updates.push(`title = $${paramCount++}`); values.push(title); }
    if (description !== undefined) { updates.push(`description = $${paramCount++}`); values.push(description); }
    if (meeting_date !== undefined) { updates.push(`meeting_date = $${paramCount++}`); values.push(meeting_date); }
    if (meeting_time !== undefined) { updates.push(`meeting_time = $${paramCount++}`); values.push(meeting_time); }
    if (duration !== undefined) { updates.push(`duration = $${paramCount++}`); values.push(duration); }
    if (location !== undefined) { updates.push(`location = $${paramCount++}`); values.push(location); }
    if (status !== undefined) { updates.push(`status = $${paramCount++}`); values.push(status); }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const query = `UPDATE meetings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const { rows } = await pool.query(query, values);
    if (!rows[0]) return res.status(404).json({ error: 'Meeting not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/meetings/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM meetings WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
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
