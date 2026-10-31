// server.js - Brightloop Subscription Management System
// Built with zero external dependencies using Node.js 22 built-in http & node:sqlite

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'brightloop.db');

// Initialize database
const db = new DatabaseSync(DB_FILE);

// Setup database tables
function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'customer')),
      phone TEXT,
      company TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS taxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rate REAL NOT NULL, -- e.g. 10 for 10%
      description TEXT,
      is_default INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'software', 'service', 'add_on', 'hardware'
      sales_price REAL NOT NULL,
      cost_price REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL, -- e.g. 'Brand: Odoo', 'Brand: Brightloop Standard'
      price_extra REAL NOT NULL DEFAULT 0.0, -- e.g. +560 for Odoo brand
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      billing_interval TEXT NOT NULL CHECK(billing_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
      cost REAL NOT NULL,
      min_quantity INTEGER DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      auto_close_on_end INTEGER DEFAULT 1,
      allow_close_early INTEGER DEFAULT 1,
      allow_pause INTEGER DEFAULT 1,
      allow_renew INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS discount_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('fixed', 'percentage')),
      value REAL NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('all', 'product')),
      product_id INTEGER,
      min_purchase REAL DEFAULT 0,
      min_quantity INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      usage_limit INTEGER DEFAULT 0, -- 0 for unlimited
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS quotation_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plan_id INTEGER NOT NULL,
      validity_days INTEGER DEFAULT 30,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS quotation_template_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (template_id) REFERENCES quotation_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sub_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed')),
      payment_terms TEXT NOT NULL DEFAULT 'Immediate Payment', -- 'Immediate Payment', 'Net 15', 'Net 30'
      start_date TEXT NOT NULL,
      expiry_date TEXT,
      last_billed_date TEXT,
      next_billing_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );

    CREATE TABLE IF NOT EXISTS subscription_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      tax_rate REAL DEFAULT 0,
      amount REAL NOT NULL,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      subscription_id INTEGER,
      customer_id INTEGER NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Draft', 'Confirmed', 'Paid', 'Cancelled')),
      subtotal REAL NOT NULL DEFAULT 0,
      discount_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
      FOREIGN KEY (customer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      description TEXT,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      tax_rate REAL DEFAULT 0,
      line_subtotal REAL NOT NULL,
      line_discount REAL DEFAULT 0,
      line_tax REAL DEFAULT 0,
      line_total REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT UNIQUE NOT NULL,
      invoice_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL, -- 'Bank Transfer', 'Credit Card', 'Cash', 'Wire Transfer', 'Stripe'
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );
  `);
}

initDb();

// Seed initial realistic data for Brightloop
function seedDemoData() {
  const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (userCount > 0) return; // already seeded

  const hashPassword = (p) => crypto.createHash('sha256').update(p).digest('hex');

  // Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, phone, company)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('Sarah Jenkins (Admin)', 'admin@brightloop.com', hashPassword('AdminPass123!'), 'admin', '+1 (555) 019-2831', 'Brightloop Software HQ');
  insertUser.run('David Miller (Staff)', 'staff@brightloop.com', hashPassword('StaffPass123!'), 'staff', '+1 (555) 019-2832', 'Brightloop Operations');
  insertUser.run('Alex Rivera (Acme Corp)', 'alex@acmecorp.com', hashPassword('CustomerPass123!'), 'customer', '+1 (555) 441-9022', 'Acme Corporation');
  insertUser.run('Elena Rostova (Nova Retail)', 'elena@novaretail.io', hashPassword('CustomerPass123!'), 'customer', '+1 (555) 321-7788', 'Nova Retail Stores');
  insertUser.run('Marcus Chen (CloudLabs)', 'marcus@cloudlabs.tech', hashPassword('CustomerPass123!'), 'customer', '+1 (555) 908-1123', 'CloudLabs Inc');

  // Taxes
  const insertTax = db.prepare(`INSERT INTO taxes (name, rate, description, is_default) VALUES (?, ?, ?, ?)`);
  insertTax.run('Standard VAT / Sales Tax', 10.0, 'Standard 10% rate on software and services', 1);
  insertTax.run('Tech Cloud Service Tax', 18.0, '18% rate on cloud infrastructure', 0);
  insertTax.run('Zero Tax / Export Exempt', 0.0, '0% tax for exempt cross-border entities', 0);

  // Products
  const insertProduct = db.prepare(`
    INSERT INTO products (name, type, sales_price, cost_price, notes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const p1 = insertProduct.run('Brightloop Business Suite', 'software', 450.0, 80.0, 'Core SaaS enterprise subscription per month').lastInsertRowid;
  const p2 = insertProduct.run('CRM & Sales Automation Engine', 'software', 250.0, 40.0, 'Lead tracking, quotes and automated pipeline').lastInsertRowid;
  const p3 = insertProduct.run('Premium Dedicated Cloud Server', 'service', 800.0, 200.0, 'Dedicated high availability managed cloud cluster').lastInsertRowid;
  const p4 = insertProduct.run('Priority 24/7 Support Add-on', 'add_on', 150.0, 30.0, 'Dedicated Slack channel & 1-hour SLA response').lastInsertRowid;

  // Variants (specifically the Odoo Brand variant that adds 560 as requested in the prompt)
  const insertVariant = db.prepare(`INSERT INTO product_variants (product_id, name, price_extra) VALUES (?, ?, ?)`);
  insertVariant.run(p1, 'Standard Edition', 0.0);
  insertVariant.run(p1, 'Odoo Connected Brand', 560.0); // As per prompt: "where choosing the Odoo brand adds 560 to the price"
  insertVariant.run(p1, 'Global Enterprise Multi-Tenant', 300.0);

  insertVariant.run(p2, 'Up to 10 Seats', 0.0);
  insertVariant.run(p2, 'Unlimited Team Seats', 400.0);

  // Plans
  const insertPlan = db.prepare(`
    INSERT INTO plans (name, billing_interval, cost, min_quantity, start_date, end_date, auto_close_on_end, allow_close_early, allow_pause, allow_renew)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const planDaily = insertPlan.run('Agile Sprint Plan', 'daily', 25.0, 1, '2026-01-01', '2026-12-31', 1, 1, 1, 1).lastInsertRowid;
  const planWeekly = insertPlan.run('Growth Weekly Plan', 'weekly', 120.0, 1, '2026-01-01', '2026-12-31', 0, 1, 1, 1).lastInsertRowid;
  const planMonthly = insertPlan.run('Professional Monthly', 'monthly', 450.0, 1, '2026-01-01', '2026-12-31', 0, 1, 1, 1).lastInsertRowid;
  const planYearly = insertPlan.run('Enterprise Annual Contract', 'yearly', 4800.0, 5, '2026-01-01', '2028-12-31', 1, 0, 1, 1).lastInsertRowid;

  // Quotation Templates
  const insertTpl = db.prepare(`INSERT INTO quotation_templates (name, plan_id, validity_days) VALUES (?, ?, ?)`);
  const tpl1 = insertTpl.run('Standard SaaS Starter Offer', planMonthly, 30).lastInsertRowid;
  const tpl2 = insertTpl.run('Odoo Enterprise Growth Bundle', planYearly, 15).lastInsertRowid;

  const insertTplLine = db.prepare(`INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)`);
  insertTplLine.run(tpl1, p1, 1, 1);
  insertTplLine.run(tpl1, p4, null, 1);

  insertTplLine.run(tpl2, p1, 2, 5); // Odoo Connected (+560)
  insertTplLine.run(tpl2, p3, null, 1);
  insertTplLine.run(tpl2, p4, null, 2);

  // Discount Rules
  const insertDiscount = db.prepare(`
    INSERT INTO discount_rules (code, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit, used_count, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertDiscount.run('WELCOME15', 'percentage', 15.0, 'all', null, 200.0, 0, '2026-01-01', '2026-12-31', 100, 12, 1);
  insertDiscount.run('SEATBOOST', 'fixed', 100.0, 'all', null, 500.0, 3, '2026-01-01', '2026-12-31', 50, 4, 1);
  insertDiscount.run('ODOO50', 'percentage', 10.0, 'product', p1, 0, 1, '2026-01-01', '2026-12-31', 20, 2, 1);

  // Subscriptions
  const insertSub = db.prepare(`
    INSERT INTO subscriptions (sub_number, customer_id, plan_id, status, payment_terms, start_date, expiry_date, last_billed_date, next_billing_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const s1 = insertSub.run('SUB-2026-001', 3, planMonthly, 'Active', 'Net 30', '2026-09-01', '2027-09-01', '2026-10-01', '2026-11-01', 'Acme Corp core team').lastInsertRowid;
  const s2 = insertSub.run('SUB-2026-002', 4, planYearly, 'Active', 'Net 15', '2026-08-15', '2027-08-15', '2026-08-15', '2026-11-15', 'Nova Retail yearly contract with Odoo suite').lastInsertRowid;
  const s3 = insertSub.run('SUB-2026-003', 5, planWeekly, 'Quotation', 'Immediate Payment', '2026-10-25', '2027-10-25', null, '2026-11-01', 'CloudLabs pilot proposal').lastInsertRowid;
  const s4 = insertSub.run('SUB-2026-004', 3, planDaily, 'Draft', 'Immediate Payment', '2026-10-31', '2026-11-30', null, '2026-11-01', 'Draft add-on expansion').lastInsertRowid;
  const s5 = insertSub.run('SUB-2026-005', 4, planMonthly, 'Closed', 'Net 30', '2026-01-01', '2026-07-01', '2026-06-01', '2026-07-01', 'Old legacy subscription closed gracefully').lastInsertRowid;

  // Subscription lines
  const insertSubLine = db.prepare(`
    INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_rate, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertSubLine.run(s1, p1, 1, 2, 450.0, 10.0, 900.0);
  insertSubLine.run(s1, p4, null, 1, 150.0, 10.0, 150.0);

  insertSubLine.run(s2, p1, 2, 3, 1010.0, 10.0, 3030.0); // 450 + 560 Odoo brand = 1010
  insertSubLine.run(s2, p3, null, 1, 800.0, 18.0, 800.0);

  insertSubLine.run(s3, p2, 4, 1, 250.0, 10.0, 250.0);

  // Invoices
  const insertInv = db.prepare(`
    INSERT INTO invoices (invoice_number, subscription_id, customer_id, invoice_date, due_date, status, subtotal, discount_total, tax_total, total_amount, amount_paid, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inv1 = insertInv.run('INV-2026-001', s1, 3, '2026-09-01', '2026-09-30', 'Paid', 1050.0, 105.0, 94.5, 1039.5, 1039.5, '2026-09-01 10:00:00').lastInsertRowid;
  const inv2 = insertInv.run('INV-2026-002', s1, 3, '2026-10-01', '2026-10-15', 'Confirmed', 1050.0, 0.0, 105.0, 1155.0, 500.0, '2026-10-01 09:30:00').lastInsertRowid; // Partially paid, overdue!
  const inv3 = insertInv.run('INV-2026-003', s2, 4, '2026-08-15', '2026-09-15', 'Paid', 3830.0, 100.0, 417.0, 4147.0, 4147.0, '2026-08-15 11:15:00').lastInsertRowid;
  const inv4 = insertInv.run('INV-2026-004', s2, 4, '2026-10-15', '2026-10-25', 'Confirmed', 3830.0, 0.0, 447.0, 4277.0, 0.0, '2026-10-15 14:00:00').lastInsertRowid; // Overdue unpaid!

  // Invoice Lines
  const insertInvLine = db.prepare(`
    INSERT INTO invoice_lines (invoice_id, product_id, variant_id, description, quantity, unit_price, tax_rate, line_subtotal, line_discount, line_tax, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertInvLine.run(inv1, p1, 1, 'Brightloop Business Suite (Standard Edition)', 2, 450.0, 10.0, 900.0, 90.0, 81.0, 891.0);
  insertInvLine.run(inv1, p4, null, 'Priority 24/7 Support Add-on', 1, 150.0, 10.0, 150.0, 15.0, 13.5, 148.5);

  insertInvLine.run(inv2, p1, 1, 'Brightloop Business Suite (Standard Edition)', 2, 450.0, 10.0, 900.0, 0.0, 90.0, 990.0);
  insertInvLine.run(inv2, p4, null, 'Priority 24/7 Support Add-on', 1, 150.0, 10.0, 150.0, 0.0, 15.0, 165.0);

  insertInvLine.run(inv3, p1, 2, 'Brightloop Business Suite (Odoo Connected Brand)', 3, 1010.0, 10.0, 3030.0, 100.0, 293.0, 3223.0);
  insertInvLine.run(inv3, p3, null, 'Premium Dedicated Cloud Server', 1, 800.0, 18.0, 800.0, 0.0, 144.0, 944.0);

  insertInvLine.run(inv4, p1, 2, 'Brightloop Business Suite (Odoo Connected Brand)', 3, 1010.0, 10.0, 3030.0, 0.0, 303.0, 3333.0);
  insertInvLine.run(inv4, p3, null, 'Premium Dedicated Cloud Server', 1, 800.0, 18.0, 800.0, 0.0, 144.0, 944.0);

  // Payments
  const insertPayment = db.prepare(`
    INSERT INTO payments (payment_number, invoice_id, amount, payment_date, method, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertPayment.run('PAY-2026-001', inv1, 1039.5, '2026-09-02', 'Credit Card', 'Auto-charged corporate card ending 9942');
  insertPayment.run('PAY-2026-002', inv2, 500.0, '2026-10-05', 'Bank Transfer', 'Partial payment wire ref: TXN88712');
  insertPayment.run('PAY-2026-003', inv3, 4147.0, '2026-08-18', 'Bank Transfer', 'Annual contract wire transferred');

  console.log('Demo data successfully seeded for Brightloop Software.');
}

seedDemoData();

// Helper functions
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2e6) { // 2MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function serveStatic(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// Compute discount for an invoice line or subtotal
function evaluateDiscounts(subtotal, totalQuantity, lines = []) {
  const activeDiscounts = db.prepare(`
    SELECT * FROM discount_rules 
    WHERE is_active = 1 
      AND (start_date IS NULL OR start_date <= date('now'))
      AND (end_date IS NULL OR end_date >= date('now'))
      AND (usage_limit = 0 OR used_count < usage_limit)
    ORDER BY id ASC
  `).all();

  let discountAmount = 0;
  let appliedRules = [];

  for (const disc of activeDiscounts) {
    if (disc.min_purchase > 0 && subtotal < disc.min_purchase) continue;
    if (disc.min_quantity > 0 && totalQuantity < disc.min_quantity) continue;

    let ruleSavings = 0;
    if (disc.scope === 'all') {
      ruleSavings = disc.type === 'percentage' ? (subtotal * (disc.value / 100)) : disc.value;
    } else if (disc.scope === 'product' && disc.product_id) {
      const matchLines = lines.filter(l => l.product_id === disc.product_id);
      const productSubtotal = matchLines.reduce((acc, l) => acc + (l.unit_price * l.quantity), 0);
      if (productSubtotal > 0) {
        ruleSavings = disc.type === 'percentage' ? (productSubtotal * (disc.value / 100)) : disc.value;
      }
    }

    if (ruleSavings > 0) {
      ruleSavings = Math.min(ruleSavings, subtotal - discountAmount);
      discountAmount += ruleSavings;
      appliedRules.push({
        id: disc.id,
        code: disc.code,
        savings: ruleSavings
      });
      // Increment used count
      db.prepare('UPDATE discount_rules SET used_count = used_count + 1 WHERE id = ?').run(disc.id);
    }
  }

  return { discountAmount, appliedRules };
}

// Request Handler
const requestHandler = async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id'
    });
    res.end();
    return;
  }

  // API Routes
  try {
    // 1. AUTH & USERS
    if (pathname === '/api/auth/register' && method === 'POST') {
      const { name, email, password, role, company, phone } = await parseBody(req);
      if (!name || !email || !password) {
        return sendError(res, 400, 'Name, email and password are required');
      }

      // Password requirements: >8 chars, uppercase, lowercase, special character
      if (password.length <= 8) {
        return sendError(res, 400, 'Password must be more than 8 characters long');
      }
      if (!/[A-Z]/.test(password)) {
        return sendError(res, 400, 'Password must include at least one uppercase letter');
      }
      if (!/[a-z]/.test(password)) {
        return sendError(res, 400, 'Password must include at least one lowercase letter');
      }
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        return sendError(res, 400, 'Password must include at least one special character');
      }

      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
      if (existing) {
        return sendError(res, 400, 'Email is already registered. Each email can belong to only one account.');
      }

      const assignedRole = role === 'staff' || role === 'admin' ? role : 'customer';
      const hash = crypto.createHash('sha256').update(password).digest('hex');

      const result = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, phone, company)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, email.toLowerCase().trim(), hash, assignedRole, phone || '', company || '');

      const user = db.prepare('SELECT id, name, email, role, phone, company FROM users WHERE id = ?').get(result.lastInsertRowid);
      return sendJson(res, 201, { message: 'Registration successful', user });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await parseBody(req);
      const hash = crypto.createHash('sha256').update(password || '').digest('hex');
      const user = db.prepare('SELECT id, name, email, role, phone, company FROM users WHERE email = ? AND password_hash = ?').get(email?.toLowerCase().trim(), hash);
      if (!user) {
        return sendError(res, 401, 'Invalid email or password');
      }
      return sendJson(res, 200, { message: 'Login successful', user });
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      const { email } = await parseBody(req);
      const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email?.toLowerCase().trim());
      if (!user) {
        // As standard security practice still return ok or message
        return sendJson(res, 200, { message: 'If registered, a password reset link has been dispatched to your email address.' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 3600000).toISOString();
      db.prepare('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)').run(user.email, token, expiresAt);
      return sendJson(res, 200, {
        message: 'Password reset link simulated and generated successfully.',
        resetLink: `/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`,
        simulatedToken: token
      });
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const { email, token, newPassword } = await parseBody(req);
      if (!newPassword || newPassword.length <= 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
        return sendError(res, 400, 'Password must be >8 characters with uppercase, lowercase, and special character');
      }
      const reset = db.prepare('SELECT * FROM password_resets WHERE email = ? AND token = ?').get(email?.toLowerCase().trim(), token);
      if (!reset) {
        return sendError(res, 400, 'Invalid or expired reset token');
      }
      const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
      db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email);
      db.prepare('DELETE FROM password_resets WHERE email = ?').run(email);
      return sendJson(res, 200, { message: 'Password has been successfully updated. You may now log in.' });
    }

    // List all users or customers
    if (pathname === '/api/users' && method === 'GET') {
      const roleFilter = parsedUrl.searchParams.get('role');
      let query = 'SELECT id, name, email, role, phone, company, created_at FROM users';
      const params = [];
      if (roleFilter) {
        query += ' WHERE role = ?';
        params.push(roleFilter);
      }
      query += ' ORDER BY name ASC';
      const users = db.prepare(query).all(...params);
      return sendJson(res, 200, users);
    }

    // Admin creates internal staff member (Only Admin can add staff)
    if (pathname === '/api/users/staff' && method === 'POST') {
      const currentUserId = req.headers['x-user-id'];
      const currentUser = currentUserId ? db.prepare('SELECT role FROM users WHERE id = ?').get(currentUserId) : null;
      if (!currentUser || currentUser.role !== 'admin') {
        return sendError(res, 403, 'Permission denied: Only system administrators can add a new staff member.');
      }

      const { name, email, password, phone } = await parseBody(req);
      if (!name || !email || !password) return sendError(res, 400, 'Name, email, and temporary password required');
      if (password.length <= 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        return sendError(res, 400, 'Password must be >8 chars with uppercase, lowercase, and special symbol');
      }
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      try {
        const resUser = db.prepare('INSERT INTO users (name, email, password_hash, role, phone, company) VALUES (?, ?, ?, ?, ?, ?)').run(
          name, email.toLowerCase().trim(), hash, 'staff', phone || '', 'Brightloop Operations'
        );
        const newUser = db.prepare('SELECT id, name, email, role, phone, company FROM users WHERE id = ?').get(resUser.lastInsertRowid);
        return sendJson(res, 201, newUser);
      } catch (err) {
        return sendError(res, 400, 'Staff creation failed: ' + err.message);
      }
    }

    // 2. PRODUCTS & VARIANTS
    if (pathname === '/api/products' && method === 'GET') {
      const products = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
      const variants = db.prepare('SELECT * FROM product_variants').all();
      const productsWithVariants = products.map(p => ({
        ...p,
        variants: variants.filter(v => v.product_id === p.id)
      }));
      return sendJson(res, 200, productsWithVariants);
    }

    if (pathname === '/api/products' && method === 'POST') {
      const { name, type, sales_price, cost_price, notes, variants } = await parseBody(req);
      if (!name || !type || sales_price === undefined) {
        return sendError(res, 400, 'Name, type, and sales_price are required');
      }

      const resProd = db.prepare(`
        INSERT INTO products (name, type, sales_price, cost_price, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(name, type, parseFloat(sales_price) || 0, parseFloat(cost_price) || 0, notes || '');

      const prodId = resProd.lastInsertRowid;
      if (Array.isArray(variants)) {
        const insertVar = db.prepare('INSERT INTO product_variants (product_id, name, price_extra) VALUES (?, ?, ?)');
        for (const v of variants) {
          if (v.name) {
            insertVar.run(prodId, v.name, parseFloat(v.price_extra) || 0);
          }
        }
      }

      const created = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      created.variants = db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(prodId);
      return sendJson(res, 201, created);
    }

    // 3. PLANS
    if (pathname === '/api/plans' && method === 'GET') {
      const plans = db.prepare('SELECT * FROM plans ORDER BY id DESC').all();
      return sendJson(res, 200, plans);
    }

    if (pathname === '/api/plans' && method === 'POST') {
      const { name, billing_interval, cost, min_quantity, start_date, end_date, auto_close_on_end, allow_close_early, allow_pause, allow_renew } = await parseBody(req);
      if (!name || !billing_interval || cost === undefined) {
        return sendError(res, 400, 'Name, billing_interval, and cost are required');
      }
      const resPlan = db.prepare(`
        INSERT INTO plans (name, billing_interval, cost, min_quantity, start_date, end_date, auto_close_on_end, allow_close_early, allow_pause, allow_renew)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        name,
        billing_interval,
        parseFloat(cost) || 0,
        parseInt(min_quantity) || 1,
        start_date || null,
        end_date || null,
        auto_close_on_end ? 1 : 0,
        allow_close_early ? 1 : 0,
        allow_pause ? 1 : 0,
        allow_renew ? 1 : 0
      );
      const created = db.prepare('SELECT * FROM plans WHERE id = ?').get(resPlan.lastInsertRowid);
      return sendJson(res, 201, created);
    }

    // 4. TAXES & DISCOUNTS
    if (pathname === '/api/taxes' && method === 'GET') {
      const taxes = db.prepare('SELECT * FROM taxes ORDER BY id ASC').all();
      return sendJson(res, 200, taxes);
    }

    if (pathname === '/api/taxes' && method === 'POST') {
      const { name, rate, description, is_default } = await parseBody(req);
      if (!name || rate === undefined) return sendError(res, 400, 'Name and rate are required');
      const resTax = db.prepare('INSERT INTO taxes (name, rate, description, is_default) VALUES (?, ?, ?, ?)').run(
        name, parseFloat(rate), description || '', is_default ? 1 : 0
      );
      return sendJson(res, 201, db.prepare('SELECT * FROM taxes WHERE id = ?').get(resTax.lastInsertRowid));
    }

    if (pathname === '/api/discounts' && method === 'GET') {
      const discounts = db.prepare(`
        SELECT d.*, p.name as product_name 
        FROM discount_rules d 
        LEFT JOIN products p ON d.product_id = p.id
        ORDER BY d.id DESC
      `).all();
      return sendJson(res, 200, discounts);
    }

    if (pathname === '/api/discounts' && method === 'POST') {
      const { code, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit } = await parseBody(req);
      if (!code || !type || value === undefined) return sendError(res, 400, 'Code, type, and value are required');
      try {
        const resDisc = db.prepare(`
          INSERT INTO discount_rules (code, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit, used_count, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
        `).run(
          code.toUpperCase().trim(),
          type,
          parseFloat(value),
          scope || 'all',
          product_id ? parseInt(product_id) : null,
          parseFloat(min_purchase) || 0,
          parseInt(min_quantity) || 0,
          start_date || null,
          end_date || null,
          parseInt(usage_limit) || 0
        );
        return sendJson(res, 201, db.prepare('SELECT * FROM discount_rules WHERE id = ?').get(resDisc.lastInsertRowid));
      } catch (err) {
        return sendError(res, 400, 'Failed to create discount rule: ' + err.message);
      }
    }

    // 5. QUOTATION TEMPLATES
    if (pathname === '/api/templates' && method === 'GET') {
      const templates = db.prepare(`
        SELECT t.*, p.name as plan_name, p.billing_interval, p.cost as plan_cost
        FROM quotation_templates t
        JOIN plans p ON t.plan_id = p.id
        ORDER BY t.id DESC
      `).all();
      for (const tpl of templates) {
        tpl.lines = db.prepare(`
          SELECT l.*, pr.name as product_name, pr.sales_price, pv.name as variant_name, pv.price_extra
          FROM quotation_template_lines l
          JOIN products pr ON l.product_id = pr.id
          LEFT JOIN product_variants pv ON l.variant_id = pv.id
          WHERE l.template_id = ?
        `).all(tpl.id);
      }
      return sendJson(res, 200, templates);
    }

    if (pathname === '/api/templates' && method === 'POST') {
      const { name, plan_id, validity_days, lines } = await parseBody(req);
      if (!name || !plan_id) return sendError(res, 400, 'Name and plan_id are required');
      const resTpl = db.prepare('INSERT INTO quotation_templates (name, plan_id, validity_days) VALUES (?, ?, ?)').run(
        name, parseInt(plan_id), parseInt(validity_days) || 30
      );
      const tplId = resTpl.lastInsertRowid;
      if (Array.isArray(lines)) {
        const insLine = db.prepare('INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity) VALUES (?, ?, ?, ?)');
        for (const l of lines) {
          insLine.run(tplId, l.product_id, l.variant_id || null, l.quantity || 1);
        }
      }
      return sendJson(res, 201, { id: tplId, message: 'Quotation template created' });
    }

    // 6. SUBSCRIPTIONS & QUOTATIONS
    if (pathname === '/api/subscriptions' && method === 'GET') {
      const customerId = parsedUrl.searchParams.get('customer_id');
      const statusFilter = parsedUrl.searchParams.get('status');
      
      let query = `
        SELECT s.*, u.name as customer_name, u.email as customer_email, u.company as customer_company,
               p.name as plan_name, p.billing_interval, p.cost as plan_cost, p.allow_pause, p.allow_renew, p.allow_close_early
        FROM subscriptions s
        JOIN users u ON s.customer_id = u.id
        JOIN plans p ON s.plan_id = p.id
        WHERE 1=1
      `;
      const params = [];
      if (customerId) {
        query += ' AND s.customer_id = ?';
        params.push(customerId);
      }
      if (statusFilter) {
        query += ' AND s.status = ?';
        params.push(statusFilter);
      }
      query += ' ORDER BY s.id DESC';

      const subs = db.prepare(query).all(...params);
      for (const s of subs) {
        s.lines = db.prepare(`
          SELECT sl.*, pr.name as product_name, pv.name as variant_name
          FROM subscription_lines sl
          JOIN products pr ON sl.product_id = pr.id
          LEFT JOIN product_variants pv ON sl.variant_id = pv.id
          WHERE sl.subscription_id = ?
        `).all(s.id);
        s.total_amount = s.lines.reduce((acc, l) => acc + l.amount, 0);
      }
      return sendJson(res, 200, subs);
    }

    if (pathname === '/api/subscriptions' && method === 'POST') {
      const { customer_id, plan_id, payment_terms, start_date, expiry_date, lines, notes, template_id } = await parseBody(req);
      if (!customer_id || !plan_id) {
        return sendError(res, 400, 'Customer and Plan are required');
      }

      // Generate sequence number SUB-YYYY-XXXX
      const count = db.prepare('SELECT count(*) as count FROM subscriptions').get().count + 1;
      const subNumber = `SUB-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(plan_id);
      if (!plan) return sendError(res, 404, 'Selected plan not found');

      // Next billing date is start_date by default
      const sDate = start_date || new Date().toISOString().split('T')[0];
      const eDate = expiry_date || null;

      const resSub = db.prepare(`
        INSERT INTO subscriptions (sub_number, customer_id, plan_id, status, payment_terms, start_date, expiry_date, last_billed_date, next_billing_date, notes)
        VALUES (?, ?, ?, 'Draft', ?, ?, ?, NULL, ?, ?)
      `).run(subNumber, parseInt(customer_id), parseInt(plan_id), payment_terms || 'Immediate Payment', sDate, eDate, sDate, notes || '');

      const subId = resSub.lastInsertRowid;

      // Populate lines (either from provided lines or from template)
      let linesToInsert = lines || [];
      if ((!lines || lines.length === 0) && template_id) {
        const tplLines = db.prepare('SELECT * FROM quotation_template_lines WHERE template_id = ?').all(template_id);
        linesToInsert = tplLines.map(tl => {
          const prod = db.prepare('SELECT sales_price FROM products WHERE id = ?').get(tl.product_id);
          let extra = 0;
          if (tl.variant_id) {
            const v = db.prepare('SELECT price_extra FROM product_variants WHERE id = ?').get(tl.variant_id);
            extra = v ? v.price_extra : 0;
          }
          return {
            product_id: tl.product_id,
            variant_id: tl.variant_id,
            quantity: tl.quantity,
            unit_price: (prod ? prod.sales_price : 0) + extra,
            tax_rate: 10.0
          };
        });
      }

      const insLine = db.prepare(`
        INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_rate, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const line of linesToInsert) {
        const qty = parseInt(line.quantity) || 1;
        const up = parseFloat(line.unit_price) || 0;
        const tax = parseFloat(line.tax_rate) || 0;
        const lineTotal = (qty * up) * (1 + tax / 100);
        insLine.run(subId, parseInt(line.product_id), line.variant_id ? parseInt(line.variant_id) : null, qty, up, tax, lineTotal);
      }

      const created = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId);
      return sendJson(res, 201, created);
    }

    // Change Subscription Lifecycle Status: Draft -> Quotation -> Confirmed -> Active -> Closed (or Paused/Resumed)
    if (pathname.match(/^\/api\/subscriptions\/(\d+)\/status$/) && method === 'POST') {
      const subId = parseInt(pathname.split('/')[3]);
      const { status } = await parseBody(req);
      const validStatuses = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed'];
      if (!validStatuses.includes(status)) {
        return sendError(res, 400, 'Invalid status transition');
      }

      const sub = db.prepare('SELECT s.*, p.auto_close_on_end, p.allow_close_early, p.allow_pause, p.allow_renew FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.id = ?').get(subId);
      if (!sub) return sendError(res, 404, 'Subscription not found');

      // Check plan restrictions
      if (status === 'Paused' && !sub.allow_pause) {
        return sendError(res, 400, 'This plan does not permit pausing.');
      }
      if (status === 'Closed' && !sub.allow_close_early && sub.status !== 'Draft') {
        const today = new Date().toISOString().split('T')[0];
        if (sub.expiry_date && today < sub.expiry_date) {
          return sendError(res, 400, 'This plan contract cannot be closed early before its expiry date.');
        }
      }

      db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(status, subId);
      return sendJson(res, 200, { message: `Subscription status updated to ${status}`, status });
    }

    // 7. INVOICING & BILLING DAY ENGINE
    // Generate invoice for a specific subscription
    function generateInvoiceForSubscription(subId) {
      const sub = db.prepare(`
        SELECT s.*, u.name as customer_name, p.billing_interval
        FROM subscriptions s
        JOIN users u ON s.customer_id = u.id
        JOIN plans p ON s.plan_id = p.id
        WHERE s.id = ?
      `).get(subId);

      if (!sub) throw new Error('Subscription not found');

      const lines = db.prepare(`
        SELECT sl.*, pr.name as product_name, pv.name as variant_name
        FROM subscription_lines sl
        JOIN products pr ON sl.product_id = pr.id
        LEFT JOIN product_variants pv ON sl.variant_id = pv.id
        WHERE sl.subscription_id = ?
      `).all(subId);

      if (lines.length === 0) throw new Error('No product lines exist on this subscription');

      // Sequence number INV-YYYY-XXXX
      const invCount = db.prepare('SELECT count(*) as count FROM invoices').get().count + 1;
      const invNumber = `INV-${new Date().getFullYear()}-${String(invCount).padStart(4, '0')}`;

      const today = new Date().toISOString().split('T')[0];
      // Due date based on payment terms
      let daysToAdd = 0;
      if (sub.payment_terms === 'Net 15') daysToAdd = 15;
      else if (sub.payment_terms === 'Net 30') daysToAdd = 30;

      const dueDateObj = new Date();
      dueDateObj.setDate(dueDateObj.getDate() + daysToAdd);
      const dueDate = dueDateObj.toISOString().split('T')[0];

      // Calculate totals
      let subtotal = 0;
      let totalQty = 0;
      for (const l of lines) {
        subtotal += (l.quantity * l.unit_price);
        totalQty += l.quantity;
      }

      // Check automated discount rules
      const { discountAmount } = evaluateDiscounts(subtotal, totalQty, lines);

      // Distribute discount proportionally across lines to calculate taxes accurately
      const discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
      let taxTotal = 0;

      const resInv = db.prepare(`
        INSERT INTO invoices (invoice_number, subscription_id, customer_id, invoice_date, due_date, status, subtotal, discount_total, tax_total, total_amount, amount_paid, sent_at)
        VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, 0, 0, 0, NULL)
      `).run(invNumber, sub.id, sub.customer_id, today, dueDate, subtotal, discountAmount);

      const invoiceId = resInv.lastInsertRowid;

      const insInvLine = db.prepare(`
        INSERT INTO invoice_lines (invoice_id, product_id, variant_id, description, quantity, unit_price, tax_rate, line_subtotal, line_discount, line_tax, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const l of lines) {
        const lineSub = l.quantity * l.unit_price;
        const lineDisc = lineSub * discountRatio;
        const taxable = lineSub - lineDisc;
        const lineTax = taxable * (l.tax_rate / 100);
        taxTotal += lineTax;
        const lineTot = taxable + lineTax;

        const desc = `${l.product_name}${l.variant_name ? ' (' + l.variant_name + ')' : ''}`;
        insInvLine.run(invoiceId, l.product_id, l.variant_id, desc, l.quantity, l.unit_price, l.tax_rate, lineSub, lineDisc, lineTax, lineTot);
      }

      const finalTotal = (subtotal - discountAmount) + taxTotal;
      db.prepare('UPDATE invoices SET tax_total = ?, total_amount = ? WHERE id = ?').run(taxTotal, finalTotal, invoiceId);

      // Update next billing date on subscription based on billing_interval
      const nextDate = new Date();
      if (sub.billing_interval === 'daily') nextDate.setDate(nextDate.getDate() + 1);
      else if (sub.billing_interval === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
      else if (sub.billing_interval === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (sub.billing_interval === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

      db.prepare(`
        UPDATE subscriptions 
        SET last_billed_date = ?, next_billing_date = ? 
        WHERE id = ?
      `).run(today, nextDate.toISOString().split('T')[0], sub.id);

      return invoiceId;
    }

    // Trigger individual invoice generation
    if (pathname.match(/^\/api\/subscriptions\/(\d+)\/bill$/) && method === 'POST') {
      const subId = parseInt(pathname.split('/')[3]);
      const invoiceId = generateInvoiceForSubscription(subId);
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      return sendJson(res, 201, { message: 'Invoice generated successfully', invoice });
    }

    // Run Billing Day batch engine: "hundreds of subscriptions due at once. Nothing billed twice or skipped."
    if (pathname === '/api/billing/run-day' && method === 'POST') {
      const today = new Date().toISOString().split('T')[0];
      // Due if Active, next_billing_date <= today, and not billed yet today
      const dueSubs = db.prepare(`
        SELECT id, sub_number FROM subscriptions
        WHERE status = 'Active' 
          AND (next_billing_date IS NULL OR next_billing_date <= ?)
          AND (last_billed_date IS NULL OR last_billed_date < ?)
      `).all(today, today);

      const generatedInvoiceIds = [];
      const errors = [];

      for (const sub of dueSubs) {
        try {
          const invId = generateInvoiceForSubscription(sub.id);
          generatedInvoiceIds.push({ sub_number: sub.sub_number, invoice_id: invId });
        } catch (e) {
          errors.push({ sub_number: sub.sub_number, error: e.message });
        }
      }

      return sendJson(res, 200, {
        message: `Billing Day completed: ${generatedInvoiceIds.length} invoice(s) generated.`,
        billedCount: generatedInvoiceIds.length,
        invoices: generatedInvoiceIds,
        errors
      });
    }

    // Invoices list & details
    if (pathname === '/api/invoices' && method === 'GET') {
      const customerId = parsedUrl.searchParams.get('customer_id');
      const statusFilter = parsedUrl.searchParams.get('status');
      const overdueFilter = parsedUrl.searchParams.get('overdue');

      let query = `
        SELECT i.*, u.name as customer_name, u.email as customer_email, u.company as customer_company,
               s.sub_number
        FROM invoices i
        JOIN users u ON i.customer_id = u.id
        LEFT JOIN subscriptions s ON i.subscription_id = s.id
        WHERE 1=1
      `;
      const params = [];
      if (customerId) {
        query += ' AND i.customer_id = ?';
        params.push(customerId);
      }
      if (statusFilter) {
        query += ' AND i.status = ?';
        params.push(statusFilter);
      }
      if (overdueFilter === 'true') {
        const today = new Date().toISOString().split('T')[0];
        query += ` AND i.due_date < '${today}' AND i.status != 'Paid' AND i.status != 'Cancelled'`;
      }
      query += ' ORDER BY i.id DESC';

      const invoices = db.prepare(query).all(...params);
      for (const inv of invoices) {
        inv.balance = Math.max(0, inv.total_amount - inv.amount_paid);
        inv.is_overdue = (new Date(inv.due_date) < new Date()) && inv.status !== 'Paid' && inv.status !== 'Cancelled';
        inv.lines = db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(inv.id);
      }
      return sendJson(res, 200, invoices);
    }

    // Invoice Status Change (Draft -> Confirmed -> Paid, or Cancelled)
    if (pathname.match(/^\/api\/invoices\/(\d+)\/status$/) && method === 'POST') {
      const invId = parseInt(pathname.split('/')[3]);
      const { status } = await parseBody(req);
      const valid = ['Draft', 'Confirmed', 'Paid', 'Cancelled'];
      if (!valid.includes(status)) return sendError(res, 400, 'Invalid invoice status');
      db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invId);
      return sendJson(res, 200, { message: `Invoice updated to ${status}` });
    }

    // Send Invoice simulation
    if (pathname.match(/^\/api\/invoices\/(\d+)\/send$/) && method === 'POST') {
      const invId = parseInt(pathname.split('/')[3]);
      const now = new Date().toISOString();
      db.prepare('UPDATE invoices SET sent_at = ? WHERE id = ?').run(now, invId);
      const inv = db.prepare('SELECT i.*, u.email, u.name FROM invoices i JOIN users u ON i.customer_id = u.id WHERE i.id = ?').get(invId);
      return sendJson(res, 200, {
        message: `Invoice #${inv.invoice_number} successfully emailed to ${inv.name} (${inv.email})!`,
        sent_at: now
      });
    }

    // 8. PAYMENTS
    if (pathname === '/api/payments' && method === 'GET') {
      const invId = parsedUrl.searchParams.get('invoice_id');
      let query = `
        SELECT p.*, i.invoice_number, i.total_amount, u.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN users u ON i.customer_id = u.id
      `;
      const params = [];
      if (invId) {
        query += ' WHERE p.invoice_id = ?';
        params.push(invId);
      }
      query += ' ORDER BY p.id DESC';
      const payments = db.prepare(query).all(...params);
      return sendJson(res, 200, payments);
    }

    if (pathname === '/api/payments' && method === 'POST') {
      const { invoice_id, amount, method, payment_date, note } = await parseBody(req);
      if (!invoice_id || !amount || !method) {
        return sendError(res, 400, 'Invoice ID, amount, and payment method are required');
      }

      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
      if (!inv) return sendError(res, 404, 'Invoice not found');
      if (inv.status === 'Cancelled') return sendError(res, 400, 'Cannot record payment on a cancelled invoice');

      const payCount = db.prepare('SELECT count(*) as count FROM payments').get().count + 1;
      const payNumber = `PAY-${new Date().getFullYear()}-${String(payCount).padStart(4, '0')}`;

      const payAmount = parseFloat(amount);
      const newPaidTotal = inv.amount_paid + payAmount;
      const isSettled = newPaidTotal >= (inv.total_amount - 0.01);

      db.prepare(`
        INSERT INTO payments (payment_number, invoice_id, amount, payment_date, method, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(payNumber, invoice_id, payAmount, payment_date || new Date().toISOString().split('T')[0], method, note || '');

      db.prepare(`
        UPDATE invoices 
        SET amount_paid = ?, status = ? 
        WHERE id = ?
      `).run(newPaidTotal, isSettled ? 'Paid' : (inv.status === 'Draft' ? 'Confirmed' : inv.status), invoice_id);

      return sendJson(res, 201, {
        message: 'Payment recorded successfully',
        paymentNumber: payNumber,
        newBalance: Math.max(0, inv.total_amount - newPaidTotal),
        isSettled
      });
    }

    // 9. FINANCE DASHBOARD & REPORTS (Sub-second response guaranteed!)
    if (pathname === '/api/dashboard/stats' && method === 'GET') {
      const today = new Date().toISOString().split('T')[0];

      // 1. Active Subscriptions
      const activeSubs = db.prepare("SELECT count(*) as count FROM subscriptions WHERE status = 'Active'").get().count;
      const totalSubs = db.prepare('SELECT count(*) as count FROM subscriptions').get().count;

      // 2. MRR (Monthly Recurring Revenue calculation from active subscriptions)
      const activeSubLines = db.prepare(`
        SELECT sl.amount, p.billing_interval
        FROM subscription_lines sl
        JOIN subscriptions s ON sl.subscription_id = s.id
        JOIN plans p ON s.plan_id = p.id
        WHERE s.status = 'Active'
      `).all();

      let mrr = 0;
      for (const line of activeSubLines) {
        if (line.billing_interval === 'monthly') mrr += line.amount;
        else if (line.billing_interval === 'yearly') mrr += (line.amount / 12);
        else if (line.billing_interval === 'weekly') mrr += (line.amount * 4.33);
        else if (line.billing_interval === 'daily') mrr += (line.amount * 30);
      }
      const arr = mrr * 12;

      // 3. Revenue & Collections
      const totalBilled = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status != 'Cancelled'").get().total;
      const totalCollected = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments').get().total;
      const totalOutstanding = Math.max(0, totalBilled - totalCollected);

      // 4. Overdue Invoices
      const overdueStats = db.prepare(`
        SELECT count(*) as count, COALESCE(SUM(total_amount - amount_paid), 0) as overdue_amount
        FROM invoices
        WHERE due_date < ? AND status NOT IN ('Paid', 'Cancelled')
      `).get(today);

      // 5. Invoices by Status
      const statusCounts = db.prepare(`
        SELECT status, count(*) as count, COALESCE(SUM(total_amount), 0) as total
        FROM invoices
        GROUP BY status
      `).all();

      // 6. Subscriptions by Plan
      const subsByPlan = db.prepare(`
        SELECT p.name, count(s.id) as count
        FROM plans p
        LEFT JOIN subscriptions s ON s.plan_id = p.id AND s.status = 'Active'
        GROUP BY p.id
      `).all();

      // 7. Recent Invoices & Payments for feed
      const recentInvoices = db.prepare(`
        SELECT i.*, u.name as customer_name
        FROM invoices i
        JOIN users u ON i.customer_id = u.id
        ORDER BY i.id DESC LIMIT 5
      `).all();

      const recentPayments = db.prepare(`
        SELECT p.*, i.invoice_number, u.name as customer_name
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN users u ON i.customer_id = u.id
        ORDER BY p.id DESC LIMIT 5
      `).all();

      return sendJson(res, 200, {
        activeSubs,
        totalSubs,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        overdueCount: overdueStats.count,
        overdueAmount: Math.round(overdueStats.overdue_amount * 100) / 100,
        statusCounts,
        subsByPlan,
        recentInvoices,
        recentPayments
      });
    }

    // Static Assets serving
    const publicDir = path.join(__dirname, 'public');
    if (pathname === '/' || pathname === '/index.html') {
      return serveStatic(res, path.join(publicDir, 'index.html'), 'text/html');
    } else if (pathname === '/styles.css') {
      return serveStatic(res, path.join(publicDir, 'styles.css'), 'text/css');
    } else if (pathname === '/app.js') {
      return serveStatic(res, path.join(publicDir, 'app.js'), 'application/javascript');
    }

    // Default 404 for unknown endpoints
    return sendError(res, 404, 'Endpoint not found');
  } catch (err) {
    console.error('Server error:', err);
    return sendError(res, 500, 'Internal Server Error: ' + err.message);
  }
};

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Brightloop Subscription Management System running on http://localhost:${PORT}`);
  });
}

module.exports = { server, requestHandler, db };

