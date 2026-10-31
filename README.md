# Brightloop Software — Subscription Management & Recurring Billing System

> Built in accordance with the Odoo Challenge Specification: *"Build one unified software platform that runs the full life of a subscription business, from setting up products and plans to sending invoices, collecting payments and reporting revenue."*

---

## ⚡ Quick Start

Zero external npm dependencies needed! Built with Node.js 22 built-in `http` and `node:sqlite`.

```bash
# Start the server (runs on http://localhost:3000)
npm start
# or
node server.js
```

### Running the Automated Test Suite

```bash
npm test
# or
node test.js
```

---

## 🎯 Specification & Features Implemented

### 1. Customer Signup & RBAC ("A new customer signs up")
- **Password Enforcement:** Validates `> 8 characters`, at least 1 uppercase letter, 1 lowercase letter, and 1 special symbol.
- **Email Uniqueness:** Each email can belong to only one account.
- **Forgot Password:** Password reset token generation and email dispatch simulation.
- **Role-Based Access Control (RBAC):**
  - **Admin (Sarah):** Complete system control, products, plans, taxes, discounts, and adding staff.
  - **Internal Staff (David):** Quotes, subscriptions, invoices, and payments. Cannot add staff.
  - **Customer Portal (Alex / Elena):** Restricted portal showing only their own company contracts, invoices, and payment statuses.
  - **Persona Quick Switcher:** One-click toggle in the top bar to test as Admin, Staff, or Customer immediately.

### 2. Products & Variants ("Launching a new plan")
- Catalog management: Name, type (`software`, `service`, `add_on`, `hardware`), sales price, cost price, notes.
- **Variant Engine:** Support for variant pricing surcharges. Pre-configured with the **Odoo Brand Variant adding +$560** to the price as requested in the prompt.

### 3. Recurring Plans & Interval Rules
- Billing frequency: `daily`, `weekly`, `monthly`, and `yearly`.
- Minimum quantity / seats rules.
- Plan lifecycle controls: Auto-close on expiration, allow early closure, allow pause/resume, allow renewals.

### 4. Quotes & Quotation Templates ("Turning a quote into a subscription")
- **Quotation Templates:** Predefined plan and product lines with validity periods.
- **Lifecycle Pipeline:** Complete status progression:
  $$\text{Draft} \longrightarrow \text{Quotation} \longrightarrow \text{Confirmed} \longrightarrow \text{Active} \longrightarrow \text{Closed} \quad (\text{or Paused / Resumed})$$
- Unique auto-increment sequence numbering (e.g. `SUB-2026-0001`).
- Custom payment terms (`Immediate Payment`, `Net 15`, `Net 30`).

### 5. Automated Billing & Invoicing ("Billing day")
- **One-Click Billing Day Engine:** Batch processes all active subscriptions due for billing.
- **Double-Billing Prevention:** Tracks `last_billed_date` and `next_billing_date`. Nothing is billed twice or skipped.
- **Automated Tax Engine:** Calculates taxes from admin-defined tax rates (Standard 10%, Cloud 18%, Exempt 0%).
- **Invoice Lifecycle:** `Draft` $\rightarrow$ `Confirmed` $\rightarrow$ `Paid` (or `Cancelled`).
- Printable invoice viewer with custom `@media print` layout and simulated email dispatch.

### 6. Discount Engine ("A customer asks for a better price")
- Admin-defined rules: Fixed amount or percentage.
- Minimum purchase amount or minimum seats requirements.
- Scope: Whole subscription or specific product line.
- Usage limits and date ranges. Automatically applies to generated invoices and ceases when expired or exhausted.

### 7. Cash Collection & Payments ("The money comes in")
- Payments recorded against specific invoices with payment method (`Bank Transfer`, `Credit Card`, `Cash`, `Stripe`), amount, date, and transaction reference.
- Partial payment tracking and automatic invoice status transition to `Paid` upon full settlement.
- Real-time balance and overdue tracking.

### 8. Executive Finance Lead Dashboard ("The finance lead, at the end of the month")
- Sub-second responses (**< 2 milliseconds latency**, well below the 2-second target).
- Key Metrics:
  - Active vs. Total Subscriptions
  - Monthly Recurring Revenue (MRR) & Annual Recurring Revenue (ARR)
  - Total Billed vs. Cash Collected
  - Overdue Receivables & Overdue Count
  - Visual Breakdown by Plan and Invoice Pipeline
  - One-click CSV Export for finance reports

---

## 🏛️ Architecture & File Structure

```
Subscription_management_system/
├── server.js              # REST API & DB initialization (node:sqlite + http)
├── brightloop.db          # SQLite database with pre-seeded demo data
├── package.json           # Scripts and metadata
├── test.js                # 10/10 automated verification test suite
└── public/
    ├── index.html         # Odoo-inspired responsive single page application
    ├── styles.css         # Modern typography, badges, modal, print stylesheet
    └── app.js             # Client state, persona switching, filters, API client
```
