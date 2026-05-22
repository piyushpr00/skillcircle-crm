const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://crm_vercel:dEFyNsdJTbIOIPx7xylt4plMDwPLjAWU@dpg-d87tvfgjo6nc73cuq94g-a.singapore-postgres.render.com:5432/crm_asj9',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 1000,
});

console.log('Testing connection to Render PostgreSQL...');
pool.query('SELECT version();')
  .then(res => {
    console.log('✓ Connection SUCCESSFUL!');
    console.log('PostgreSQL:', res.rows[0].version.split(',')[0]);
    process.exit(0);
  })
  .catch(err => {
    console.log('✗ Connection FAILED:', err.code || err.message);
    process.exit(1);
  });

setTimeout(() => {
  console.log('✗ Timeout waiting for response');
  process.exit(1);
}, 10000);
