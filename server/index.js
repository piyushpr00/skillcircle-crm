const path = require('path');
const express = require('express');
const app = require('./app');

// Serve static files in local dev (Vercel handles this in production)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.dbInit()
  .then(() => app.listen(PORT, () => console.log(`CRM running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
