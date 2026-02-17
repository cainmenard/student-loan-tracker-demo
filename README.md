# Student Loan Payoff Tracker

A full-stack web application for managing and optimizing student loan repayment using the **Avalanche method** (highest interest rate first).

**[Live Demo →](#)** *(replace with your Vercel URL)*

---

## Features

- **Dashboard** — Lifetime progress tracking, payment history charts, debt breakdown by type, projected payoff date
- **CSV Import** — Upload aidvantage transaction exports to sync balances and payment history automatically
- **Payment Advisor** — Enter a payment amount, get the optimal allocation across all loans (Avalanche method), with one-click logging
- **Loan Management** — Full CRUD with inline editing, auto-save, active vs. paid-off views
- **Monthly Budget** — Income/expense tracking with debt allocation calculator
- **Amortization Schedule** — Actual history blended with projected future payoff, 4 chart types
- **What-If Scenarios** — Compare payment amounts with interactive slider, savings projections

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Charts | Recharts |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Hosting | Vercel (auto-deploy from GitHub) |
| Data Import | Client-side CSV parsing (Papaparse-style) |

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.js             # Dashboard with lifetime progress
│   ├── advisor/            # Payment calculator/splitter
│   ├── import/             # CSV import from aidvantage
│   ├── loans/              # Loan CRUD with inline editing
│   ├── budget/             # Income & expense management
│   ├── amortization/       # Payoff schedule + charts
│   ├── payments/           # Payment log with filters
│   └── scenarios/          # What-if comparison tool
├── components/             # Shared chart & nav components
└── lib/
    ├── supabase.js         # Database client
    ├── utils.js            # Financial calculations
    └── demoData.js         # Simulated data for demo mode
```

## Key Technical Decisions

- **Avalanche method** for payment optimization — mathematically minimizes total interest paid
- **Client-side CSV parsing** handles aidvantage's non-standard format (HTML doctype prefix, mixed quoting)
- **Deduplication** via payment fingerprinting (date + loan_id + amount) prevents double-imports
- **In-memory mock** for demo mode — same codebase serves both production (Supabase) and demo (mock data layer)
- **Optimistic UI** with auto-save for inline loan editing

## Running Locally

```bash
git clone https://github.com/cainmenard/student-loan-tracker-demo.git
cd student-loan-tracker-demo
npm install
npm run dev
```

No environment variables needed for demo mode — the app runs with simulated data out of the box.

## Production Setup

For a real deployment with persistent data:

1. Create a [Supabase](https://supabase.com) project
2. Run `supabase/migration.sql` in the SQL Editor
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`
4. Swap `src/lib/supabase.js` to use `createClient` from `@supabase/supabase-js`

---

Built by [Cain Menard](https://github.com/cainmenard)
