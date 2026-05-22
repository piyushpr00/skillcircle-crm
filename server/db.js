require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 30000,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'executive',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      number TEXT DEFAULT '',
      email TEXT DEFAULT '',
      location TEXT DEFAULT '',
      budget TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS remarks (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      remark TEXT NOT NULL,
      follow_up_date DATE,
      follow_up_time TIME DEFAULT '09:00:00',
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE remarks ADD COLUMN IF NOT EXISTS follow_up_time TIME DEFAULT '09:00:00';

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      remark_id INTEGER REFERENCES remarks(id) ON DELETE CASCADE,
      minutes_before INTEGER,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(remark_id, minutes_before)
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id SERIAL PRIMARY KEY,
      remark_id INTEGER REFERENCES remarks(id) ON DELETE CASCADE,
      client_name TEXT,
      minutes_before INTEGER,
      message TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count) === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      "INSERT INTO users (username, password, role) VALUES ('admin', $1, 'admin')",
      [hash]
    );
    console.log('Default admin created — username: admin  password: admin123');
  }
}

module.exports = { pool, init };
