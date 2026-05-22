const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://crmapp:vkm7zuV7tFVlTzwDUuANcfdMNSiNslpy@dpg-d87tvfgjo6nc73cuq94g-a.singapore-postgres.render.com/crm_asj9',
  ssl: { rejectUnauthorized: false },
});

async function init() {
  try {
    console.log('Creating database tables...');
    
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
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✓ Tables created');
    
    // Create default admin user
    const { rows } = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        "INSERT INTO users (username, password, role) VALUES ('admin', $1, 'admin')",
        [hash]
      );
      console.log('✓ Default admin created');
      console.log('  Username: admin');
      console.log('  Password: admin123');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }
}

init();
