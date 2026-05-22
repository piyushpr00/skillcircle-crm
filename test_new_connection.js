const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://crmapp:vkm7zuV7tFVlTzwDUuANcfdMNSiNslpy@dpg-d87tvfgjo6nc73cuq94g-a.singapore-postgres.render.com/crm_asj9',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

console.log('Testing new connection string...');
pool.query('SELECT version(), COUNT(*) as user_count FROM users;')
  .then(res => {
    console.log('✓ Connection SUCCESSFUL!');
    console.log('PostgreSQL version:', res.rows[0].version.split(',')[0]);
    console.log('Users in database:', res.rows[0].user_count);
    process.exit(0);
  })
  .catch(err => {
    console.log('✗ Connection FAILED:', err.message);
    process.exit(1);
  });

setTimeout(() => {
  console.log('✗ Timeout');
  process.exit(1);
}, 10000);
