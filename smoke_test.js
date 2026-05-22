const https = require('https');

const BASE_URL = 'https://dashboard-rho-cyan-34.vercel.app';
let token = '';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 CRM SMOKE TEST\n');
  let passed = 0, failed = 0;

  try {
    // TEST 1: LOGIN
    console.log('TEST 1: User Login');
    let res = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    if (res.status === 200 && res.data.token) {
      token = res.data.token;
      console.log('✓ Login successful, token received\n');
      passed++;
    } else {
      console.log('✗ Login failed\n');
      failed++;
    }

    // TEST 2: GET USERS
    console.log('TEST 2: Fetch Users');
    res = await request('GET', '/api/auth/users');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✓ Users fetched: ${res.data.length} user(s) found`);
      console.log(`  - Admin user: ${res.data[0].username} (ID: ${res.data[0].id})\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch users\n');
      failed++;
    }

    // TEST 3: CREATE CLIENT
    console.log('TEST 3: Create Client');
    const clientData = {
      name: 'Test Company ABC',
      number: '+1-555-0100',
      email: 'contact@testcompany.com',
      location: 'New York, USA',
      budget: '$50,000'
    };
    res = await request('POST', '/api/clients', clientData);
    let clientId = null;
    if (res.status === 201 && res.data.id) {
      clientId = res.data.id;
      console.log(`✓ Client created successfully (ID: ${clientId})\n`);
      passed++;
    } else {
      console.log(`✗ Failed to create client (Status: ${res.status})\n`);
      failed++;
    }

    // TEST 4: GET CLIENTS
    console.log('TEST 4: Fetch Clients');
    res = await request('GET', '/api/clients');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✓ Clients fetched: ${res.data.length} client(s) found`);
      console.log(`  - Sample client: ${res.data[0].name} (ID: ${res.data[0].id})\n`);
      if (clientId === null) clientId = res.data[0].id;
      passed++;
    } else {
      console.log('✗ Failed to fetch clients\n');
      failed++;
    }

    // TEST 5: ADD REMARK
    if (clientId) {
      console.log('TEST 5: Add Remark with Follow-up Date');
      const followupDate = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
      const remarkData = {
        remark: 'Initial meeting scheduled, discussed project scope and timeline',
        follow_up_date: followupDate
      };
      res = await request('POST', `/api/clients/${clientId}/remarks`, remarkData);
      if (res.status === 201 && res.data.id) {
        console.log(`✓ Remark added successfully`);
        console.log(`  - Follow-up: ${remarkData.follow_up_date}\n`);
        passed++;
      } else {
        console.log(`✗ Failed to add remark (Status: ${res.status})\n`);
        failed++;
      }
    }

    // TEST 6: GET REMARKS
    if (clientId) {
      console.log('TEST 6: Fetch Remarks');
      res = await request('GET', `/api/clients/${clientId}/remarks`);
      if (res.status === 200 && Array.isArray(res.data)) {
        console.log(`✓ Remarks fetched: ${res.data.length} remark(s) found\n`);
        passed++;
      } else {
        console.log('✗ Failed to fetch remarks\n');
        failed++;
      }
    }

    // TEST 7: TODAY'S FOLLOW-UPS
    console.log('TEST 7: Check Todays Follow-ups');
    res = await request('GET', '/api/followups/today');
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ Todays follow-ups: ${res.data.length} item(s)\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch todays follow-ups\n');
      failed++;
    }

    // TEST 8: UPCOMING FOLLOW-UPS
    console.log('TEST 8: Check Upcoming Follow-ups');
    res = await request('GET', '/api/followups/upcoming');
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ Upcoming follow-ups: ${res.data.length} item(s)\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch upcoming follow-ups\n');
      failed++;
    }

    // TEST 9: CREATE EXECUTIVE USER
    console.log('TEST 9: Create Executive User');
    const newUser = {
      username: 'executive1',
      password: 'exec_pass_123',
      role: 'executive'
    };
    res = await request('POST', '/api/auth/users', newUser);
    if (res.status === 201 && res.data.id) {
      console.log(`✓ Executive user created (ID: ${res.data.id})\n`);
      passed++;
    } else {
      console.log(`✗ Failed to create executive user (Status: ${res.status})\n`);
      failed++;
    }

    // TEST 10: UPDATE CLIENT
    if (clientId) {
      console.log('TEST 10: Update Client');
      const updateData = { budget: '$75,000' };
      res = await request('PUT', `/api/clients/${clientId}`, updateData);
      if ((res.status === 200 || res.status === 204) || res.data.id) {
        console.log(`✓ Client updated successfully\n`);
        passed++;
      } else {
        console.log('✗ Failed to update client\n');
        failed++;
      }
    }

    // TEST 11: DELETE REMARK
    if (clientId) {
      console.log('TEST 11: Delete Remark');
      res = await request('GET', `/api/clients/${clientId}/remarks`);
      if (res.data && res.data.length > 0) {
        const remarkId = res.data[0].id;
        res = await request('DELETE', `/api/clients/${clientId}/remarks/${remarkId}`);
        if (res.status === 200 || res.status === 204) {
          console.log(`✓ Remark deleted successfully\n`);
          passed++;
        } else {
          console.log('✗ Failed to delete remark\n');
          failed++;
        }
      } else {
        console.log('⊘ No remarks to delete (skipped)\n');
      }
    }

    // TEST 12: DELETE CLIENT
    if (clientId) {
      console.log('TEST 12: Delete Client');
      res = await request('DELETE', `/api/clients/${clientId}`);
      if (res.status === 200 || res.status === 204) {
        console.log(`✓ Client deleted successfully\n`);
        passed++;
      } else {
        console.log('✗ Failed to delete client\n');
        failed++;
      }
    }

  } catch (err) {
    console.error('✗ Error:', err.message);
    failed++;
  }

  // SUMMARY
  console.log('═'.repeat(50));
  console.log(`\n📊 SMOKE TEST SUMMARY\n`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! CRM is fully operational.\n');
  } else {
    console.log(`⚠️ ${failed} test(s) failed. Please investigate.\n`);
  }
}

runTests().catch(console.error);
