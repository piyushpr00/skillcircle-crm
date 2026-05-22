const https = require('https');

const BASE_URL = 'https://dashboard-rho-cyan-34.vercel.app';
let token = '';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const opts = {
      hostname: url.hostname,
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
      console.log('✓ Login successful\n');
      passed++;
    } else {
      console.log('✗ Login failed\n');
      failed++;
    }

    // TEST 2: GET USERS
    console.log('TEST 2: Fetch Users');
    res = await request('GET', '/api/auth/users');
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log(`✓ ${res.data.length} user(s) found (Admin: ${res.data[0].username})\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch users\n');
      failed++;
    }

    // TEST 3: CREATE CLIENT
    console.log('TEST 3: Create Client');
    const clientData = {
      name: 'TechCorp Solutions',
      number: '+1-555-0123',
      email: 'info@techcorp.com',
      location: 'San Francisco, CA',
      budget: '$100,000'
    };
    res = await request('POST', '/api/clients', clientData);
    let clientId = null;
    if (res.status === 200 && res.data.id) {
      clientId = res.data.id;
      console.log(`✓ Client created (ID: ${clientId})\n`);
      passed++;
    } else {
      console.log(`✗ Failed to create client\n`);
      failed++;
    }

    // TEST 4: GET CLIENTS
    console.log('TEST 4: Fetch Clients');
    res = await request('GET', '/api/clients');
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ ${res.data.length} client(s) found\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch clients\n');
      failed++;
    }

    // TEST 5: GET SPECIFIC CLIENT (includes remarks)
    if (clientId) {
      console.log('TEST 5: Get Client Details with Remarks');
      res = await request('GET', `/api/clients/${clientId}`);
      if (res.status === 200 && res.data.id && Array.isArray(res.data.remarks)) {
        console.log(`✓ Client ${res.data.name} loaded with ${res.data.remarks.length} remarks\n`);
        passed++;
      } else {
        console.log('✗ Failed to get client details\n');
        failed++;
      }
    }

    // TEST 6: ADD REMARK
    if (clientId) {
      console.log('TEST 6: Add Remark with Follow-up Date');
      const followupDate = new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0];
      const remarkData = {
        remark: 'Initial consultation completed. Awaiting proposal review.',
        follow_up_date: followupDate
      };
      res = await request('POST', `/api/clients/${clientId}/remarks`, remarkData);
      if (res.status === 200 && res.data.id) {
        console.log(`✓ Remark added (Follow-up: ${followupDate})\n`);
        passed++;
      } else {
        console.log(`✗ Failed to add remark\n`);
        failed++;
      }
    }

    // TEST 7: GET CLIENT WITH UPDATED REMARKS
    if (clientId) {
      console.log('TEST 7: Verify Remark Added');
      res = await request('GET', `/api/clients/${clientId}`);
      if (res.status === 200 && res.data.remarks && res.data.remarks.length > 0) {
        console.log(`✓ ${res.data.remarks.length} remark(s) now visible\n`);
        passed++;
      } else {
        console.log('✗ Failed to verify remark\n');
        failed++;
      }
    }

    // TEST 8: TODAY'S FOLLOW-UPS
    console.log('TEST 8: Check Todays Follow-ups');
    res = await request('GET', '/api/followups/today');
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ ${res.data.length} item(s) due today\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch todays follow-ups\n');
      failed++;
    }

    // TEST 9: UPCOMING FOLLOW-UPS
    console.log('TEST 9: Check Upcoming Follow-ups');
    res = await request('GET', '/api/followups/upcoming');
    if (res.status === 200 && Array.isArray(res.data)) {
      console.log(`✓ ${res.data.length} upcoming item(s)\n`);
      passed++;
    } else {
      console.log('✗ Failed to fetch upcoming follow-ups\n');
      failed++;
    }

    // TEST 10: CREATE EXECUTIVE USER
    console.log('TEST 10: Create Executive User');
    const timestamp = Date.now();
    const newUser = {
      username: `exec_${timestamp}`,
      password: 'SecurePass@123',
      role: 'executive'
    };
    res = await request('POST', '/api/auth/users', newUser);
    if (res.status === 200 && res.data.id) {
      console.log(`✓ Executive user created (ID: ${res.data.id})\n`);
      passed++;
    } else {
      console.log(`✗ Failed to create executive user (Status: ${res.status})\n`);
      failed++;
    }

    // TEST 11: UPDATE CLIENT
    if (clientId) {
      console.log('TEST 11: Update Client Data');
      const updateData = {
        name: 'TechCorp Solutions (Updated)',
        number: '+1-555-0999',
        email: 'sales@techcorp.com',
        location: 'Los Angeles, CA',
        budget: '$150,000'
      };
      res = await request('PUT', `/api/clients/${clientId}`, updateData);
      if (res.status === 200 && res.data.ok) {
        console.log(`✓ Client updated\n`);
        passed++;
      } else {
        console.log('✗ Failed to update client\n');
        failed++;
      }
    }

    // TEST 12: DELETE REMARK
    if (clientId) {
      console.log('TEST 12: Delete Remark');
      res = await request('GET', `/api/clients/${clientId}`);
      if (res.data.remarks && res.data.remarks.length > 0) {
        const remarkId = res.data.remarks[0].id;
        res = await request('DELETE', `/api/remarks/${remarkId}`);
        if (res.status === 200) {
          console.log(`✓ Remark deleted\n`);
          passed++;
        } else {
          console.log('✗ Failed to delete remark\n');
          failed++;
        }
      }
    }

    // TEST 13: DELETE CLIENT
    if (clientId) {
      console.log('TEST 13: Delete Client');
      res = await request('DELETE', `/api/clients/${clientId}`);
      if (res.status === 200) {
        console.log(`✓ Client deleted\n`);
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
  console.log('═'.repeat(60));
  console.log(`\n📊 SMOKE TEST RESULTS\n`);
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log(`  Total:   ${passed + failed}\n`);

  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED - CRM IS FULLY OPERATIONAL!\n');
    console.log('═'.repeat(60));
  } else {
    console.log(`  ⚠️  ${failed} test(s) failed\n`);
    console.log('═'.repeat(60));
  }
}

runTests().catch(console.error);
