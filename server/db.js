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
      email TEXT,
      role TEXT DEFAULT 'executive',
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS position TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS joining_date DATE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;

    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      number TEXT DEFAULT '',
      email TEXT DEFAULT '',
      location TEXT DEFAULT '',
      budget TEXT DEFAULT '',
      assigned_to INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);

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

    CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT DEFAULT 'light',
      timezone TEXT DEFAULT 'IST',
      language TEXT DEFAULT 'en',
      date_format TEXT DEFAULT 'DD/MM/YYYY',
      time_format TEXT DEFAULT '24h',
      first_day_of_week INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      email_notifications BOOLEAN DEFAULT true,
      sound_notifications BOOLEAN DEFAULT true,
      browser_notifications BOOLEAN DEFAULT true,
      followup_15min BOOLEAN DEFAULT true,
      followup_10min BOOLEAN DEFAULT true,
      followup_5min BOOLEAN DEFAULT true,
      followup_3min BOOLEAN DEFAULT true,
      daily_digest BOOLEAN DEFAULT false,
      digest_time TIME DEFAULT '09:00:00',
      mute_start_time TIME,
      mute_end_time TIME,
      mute_weekends BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS login_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      login_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      logout_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      assigned_to INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      meeting_date DATE NOT NULL,
      meeting_time TIME NOT NULL,
      duration INTEGER DEFAULT 30,
      location TEXT,
      meeting_link TEXT,
      status TEXT DEFAULT 'scheduled',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meeting_notifications (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE,
      minutes_before INTEGER,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(meeting_id, minutes_before)
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
