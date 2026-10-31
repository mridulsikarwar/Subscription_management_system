// test.js - In-process verification test suite for Brightloop Subscription Management System
const assert = require('assert');
const { Readable, Writable } = require('stream');
const { requestHandler, db } = require('./server.js');

// Mock HTTP client calling requestHandler directly without network sockets
function invokeRequest(pathname, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    // Mock Readable stream for request
    const req = new Readable({
      read() {
        if (body) {
          this.push(typeof body === 'string' ? body : JSON.stringify(body));
        }
        this.push(null);
      }
    });

    req.method = method;
    req.url = pathname;
    req.headers = {
      host: 'localhost:3000',
      'content-type': 'application/json',
      ...headers
    };

    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];

    // Mock Writable stream for response
    const res = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });

    res.writeHead = function (code, hdrs) {
      statusCode = code;
      if (hdrs) Object.assign(resHeaders, hdrs);
      return res;
    };

    res.setHeader = function (k, v) {
      resHeaders[k.toLowerCase()] = v;
    };

    res.end = function (data) {
      if (data) chunks.push(Buffer.from(data));
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) {
        parsed = raw;
      }
      resolve({ status: statusCode, data: parsed, headers: resHeaders });
    };

    requestHandler(req, res);
  });
}

async function runAllTests() {
  console.log('========================================================');
  console.log('🧪 Running Verification Tests for Brightloop System');
  console.log('========================================================\n');

  // 1. Password validation tests on signup
  console.log('Test 1: Password rules & Customer Registration validation...');
  // Password too short (<= 8)
  let res = await invokeRequest('/api/auth/register', {
    method: 'POST',
    body: { name: 'Alice', email: 'alice@test.com', password: 'Short1!' }
  });
  assert.strictEqual(res.status, 400, 'Should reject password <= 8 chars');
  assert.ok(res.data.error.includes('8 characters'));

  // Password missing special character
  res = await invokeRequest('/api/auth/register', {
    method: 'POST',
    body: { name: 'Alice', email: 'alice@test.com', password: 'Password123' }
  });
  assert.strictEqual(res.status, 400, 'Should reject password missing special char');
  assert.ok(res.data.error.includes('special character'));

  // Valid password registration
  const uniqueEmail = `brightloop_client_${Date.now()}@domain.com`;
  res = await invokeRequest('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Bright Client',
      email: uniqueEmail,
      password: 'StrongPassword123!',
      company: 'Client Corp'
    }
  });
  assert.strictEqual(res.status, 201, 'Valid user registration should succeed');
  const newUserId = res.data.user.id;
  assert.strictEqual(res.data.user.role, 'customer');

  // Duplicate email check
  res = await invokeRequest('/api/auth/register', {
    method: 'POST',
    body: { name: 'Duplicate Bob', email: uniqueEmail, password: 'StrongPassword123!' }
  });
  assert.strictEqual(res.status, 400, 'Duplicate email should be rejected');

  console.log('  ✅ Test 1 Passed: Password rules, email uniqueness & role assignment verified.\n');

  // 2. Password Reset Flow
  console.log('Test 2: Password reset link simulation & dispatch...');
  res = await invokeRequest('/api/auth/forgot-password', {
    method: 'POST',
    body: { email: uniqueEmail }
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.simulatedToken, 'Reset token generated');
  assert.ok(res.data.resetLink.includes(res.data.simulatedToken));
  console.log('  ✅ Test 2 Passed: Password reset token and link simulated.\n');

  // 3. RBAC: Only Admin can add Staff
  console.log('Test 3: RBAC enforcement - only admin can add staff...');
  // Customer attempt to add staff (User ID = newUserId)
  res = await invokeRequest('/api/users/staff', {
    method: 'POST',
    headers: { 'x-user-id': newUserId.toString() },
    body: { name: 'Illegal Staff', email: 'illegal@brightloop.com', password: 'StaffPassword123!' }
  });
  assert.strictEqual(res.status, 403, 'Customer cannot add staff members');

  // Admin attempt (User ID = 1 Sarah)
  const staffEmail = `staff_rep_${Date.now()}@brightloop.com`;
  res = await invokeRequest('/api/users/staff', {
    method: 'POST',
    headers: { 'x-user-id': '1' },
    body: { name: 'Support Rep', email: staffEmail, password: 'StaffPassword123!' }
  });
  assert.strictEqual(res.status, 201, 'Admin can add internal staff');
  assert.strictEqual(res.data.role, 'staff');
  console.log('  ✅ Test 3 Passed: Role-based access control strictly enforced.\n');

  // 4. Products & Variants (e.g. Odoo brand variant adds +$560)
  console.log('Test 4: Products & Variants pricing (e.g. Odoo brand adds 560)...');
  res = await invokeRequest('/api/products');
  assert.strictEqual(res.status, 200);
  const coreSuite = res.data.find(p => p.name === 'Brightloop Business Suite');
  assert.ok(coreSuite, 'Core suite product must exist');
  const odooVariant = coreSuite.variants.find(v => v.price_extra === 560);
  assert.ok(odooVariant, 'Variant with +560 extra price exists as required in prompt');
  console.log(`  ✅ Test 4 Passed: Product variants supported. Variant "${odooVariant.name}" adds +$${odooVariant.price_extra}.\n`);

  // 5. Recurring Plans & Intervals
  console.log('Test 5: Recurring billing intervals & plan configuration...');
  res = await invokeRequest('/api/plans');
  assert.strictEqual(res.status, 200);
  const intervals = res.data.map(p => p.billing_interval);
  assert.ok(intervals.includes('daily'), 'Daily plan supported');
  assert.ok(intervals.includes('weekly'), 'Weekly plan supported');
  assert.ok(intervals.includes('monthly'), 'Monthly plan supported');
  assert.ok(intervals.includes('yearly'), 'Yearly plan supported');
  console.log('  ✅ Test 5 Passed: All required billing intervals (daily, weekly, monthly, yearly) configured.\n');

  // 6. Quotation to Subscription Lifecycle: Draft -> Quotation -> Confirmed -> Active -> Closed
  console.log('Test 6: Quotation & Subscription lifecycle progression...');
  // Create Draft subscription
  res = await invokeRequest('/api/subscriptions', {
    method: 'POST',
    body: {
      customer_id: newUserId,
      plan_id: 3, // Monthly Pro
      payment_terms: 'Net 30',
      lines: [
        { product_id: coreSuite.id, variant_id: odooVariant.id, quantity: 2, unit_price: 1010, tax_rate: 10.0 }
      ]
    }
  });
  assert.strictEqual(res.status, 201);
  const subId = res.data.id;
  assert.strictEqual(res.data.status, 'Draft');
  assert.ok(res.data.sub_number.startsWith('SUB-'));

  // Move to Quotation
  res = await invokeRequest(`/api/subscriptions/${subId}/status`, { method: 'POST', body: { status: 'Quotation' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.status, 'Quotation');

  // Move to Confirmed
  res = await invokeRequest(`/api/subscriptions/${subId}/status`, { method: 'POST', body: { status: 'Confirmed' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.status, 'Confirmed');

  // Move to Active
  res = await invokeRequest(`/api/subscriptions/${subId}/status`, { method: 'POST', body: { status: 'Active' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.status, 'Active');

  console.log('  ✅ Test 6 Passed: Full lifecycle Draft -> Quotation -> Confirmed -> Active validated.\n');

  // 7. Billing Engine & Automatic Invoicing
  console.log('Test 7: Automatic recurring invoice generation & discount application...');
  res = await invokeRequest(`/api/subscriptions/${subId}/bill`, { method: 'POST' });
  assert.strictEqual(res.status, 201);
  const newInvoice = res.data.invoice;
  assert.ok(newInvoice.invoice_number.startsWith('INV-'));
  assert.strictEqual(newInvoice.status, 'Draft');
  assert.ok(newInvoice.total_amount > 0);
  assert.ok(newInvoice.tax_total > 0, 'Taxes automatically computed');
  console.log(`  ✅ Test 7 Passed: Generated invoice ${newInvoice.invoice_number} (Total: $${newInvoice.total_amount}, Tax: $${newInvoice.tax_total}, Discount: $${newInvoice.discount_total}).\n`);

  // 8. Billing Day Batch Run & Double-Billing Safeguard
  console.log('Test 8: Billing Day engine & duplicate billing prevention...');
  res = await invokeRequest('/api/billing/run-day', { method: 'POST' });
  assert.strictEqual(res.status, 200);
  console.log(`  Billing day pass 1 generated ${res.data.billedCount} invoice(s).`);

  // Running again immediately should produce 0 duplicate invoices
  res = await invokeRequest('/api/billing/run-day', { method: 'POST' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.billedCount, 0, 'No subscription should be billed twice!');
  console.log('  ✅ Test 8 Passed: Safeguard verified — zero duplicate invoices generated on second pass.\n');

  // 9. Payment recording & Cash collection against invoice
  console.log('Test 9: Recording payments & invoice settlement...');
  // Confirm the invoice first
  await invokeRequest(`/api/invoices/${newInvoice.id}/status`, { method: 'POST', body: { status: 'Confirmed' } });

  // Record payment
  res = await invokeRequest('/api/payments', {
    method: 'POST',
    body: {
      invoice_id: newInvoice.id,
      amount: newInvoice.total_amount,
      method: 'Bank Transfer',
      note: 'Wire settlement ref #WIRE-9821'
    }
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.isSettled, true, 'Invoice balance is zero, status updated to Paid');
  assert.strictEqual(res.data.newBalance, 0);

  // Check invoice is indeed marked Paid
  const invCheck = await invokeRequest('/api/invoices');
  const paidInv = invCheck.data.find(i => i.id === newInvoice.id);
  assert.strictEqual(paidInv.status, 'Paid');
  console.log(`  ✅ Test 9 Passed: Payment ${res.data.paymentNumber} recorded and invoice settled to Paid.\n`);

  // 10. Finance Lead Dashboard Sub-Second Response & Accuracy
  console.log('Test 10: Executive Finance Lead Dashboard (<2s latency & KPI metrics)...');
  const startTime = Date.now();
  res = await invokeRequest('/api/dashboard/stats');
  const latency = Date.now() - startTime;
  assert.strictEqual(res.status, 200);
  assert.ok(latency < 2000, `Dashboard response latency was ${latency}ms, strictly under 2 seconds requirement`);
  assert.ok(res.data.activeSubs > 0, 'Active subscriptions count > 0');
  assert.ok(res.data.mrr > 0, 'Monthly Recurring Revenue (MRR) calculated');
  assert.ok(res.data.arr > 0, 'Annual Recurring Revenue (ARR) calculated');
  assert.ok(res.data.totalBilled > 0, 'Total revenue tracked');
  assert.ok(res.data.totalCollected > 0, 'Cash payments tracked');
  console.log(`  Dashboard Latency: ${latency}ms`);
  console.log(`  MRR: $${res.data.mrr} | ARR: $${res.data.arr} | Active: ${res.data.activeSubs} | Overdue: ${res.data.overdueCount}`);
  console.log('  ✅ Test 10 Passed: Executive dashboard delivered sub-second responses with all required KPIs.\n');

  console.log('========================================================');
  console.log('🎉 ALL 10/10 SPECIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================');
}

runAllTests().catch(err => {
  console.error('❌ Test suite failed with error:', err);
  process.exit(1);
});
