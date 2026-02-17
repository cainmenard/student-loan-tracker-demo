// Demo scenario: Alex Chen, Software Engineer
// BS Computer Science (State University, 2015-2019)
// MBA (Mid-tier program, 2020-2022)
// Started paying Oct 2022, aggressive payoff strategy since mid-2024
// Total borrowed: ~$123,000 | Current balance: ~$78,325 | 3 loans paid off

export const DEMO_LOANS = [
  // === ACTIVE LOANS (7) ===
  // MBA Grad PLUS - highest rate, avalanche priority #1
  { id: 'demo-1', loan_id: '2-04', loan_type: 'Grad PLUS', current_balance: 12670.00, original_balance: 15000.00, interest_rate: 7.540, status: 'Active', due_date: '2026-03-28', avalanche_priority: 1, snowball_priority: 7 },
  // MBA Grad PLUS
  { id: 'demo-2', loan_id: '2-03', loan_type: 'Grad PLUS', current_balance: 18450.00, original_balance: 22000.00, interest_rate: 6.280, status: 'Active', due_date: '2026-03-28', avalanche_priority: 2, snowball_priority: 6 },
  // MBA Unsubsidized
  { id: 'demo-3', loan_id: '2-01', loan_type: 'Unsubsidized', current_balance: 17340.00, original_balance: 20500.00, interest_rate: 5.280, status: 'Active', due_date: '2026-03-28', avalanche_priority: 3, snowball_priority: 5 },
  // Undergrad Unsubsidized
  { id: 'demo-4', loan_id: '1-06', loan_type: 'Unsubsidized', current_balance: 5875.00, original_balance: 7000.00, interest_rate: 5.050, status: 'Active', due_date: '2026-03-28', avalanche_priority: 4, snowball_priority: 3 },
  // MBA Unsubsidized
  { id: 'demo-5', loan_id: '2-02', loan_type: 'Unsubsidized', current_balance: 16890.00, original_balance: 20500.00, interest_rate: 4.990, status: 'Active', due_date: '2026-03-28', avalanche_priority: 5, snowball_priority: 4 },
  // Undergrad Subsidized
  { id: 'demo-6', loan_id: '1-05', loan_type: 'Subsidized', current_balance: 4210.00, original_balance: 5500.00, interest_rate: 5.050, status: 'Active', due_date: '2026-03-28', avalanche_priority: 6, snowball_priority: 2 },
  // Undergrad Subsidized
  { id: 'demo-7', loan_id: '1-03', loan_type: 'Subsidized', current_balance: 2890.00, original_balance: 4500.00, interest_rate: 4.450, status: 'Active', due_date: '2026-03-28', avalanche_priority: 7, snowball_priority: 1 },

  // === PAID OFF LOANS (3) ===
  { id: 'demo-8', loan_id: '1-01', loan_type: 'Subsidized', current_balance: 0, original_balance: 3500.00, interest_rate: 3.730, status: 'Paid Off', avalanche_priority: 99, snowball_priority: 99 },
  { id: 'demo-9', loan_id: '1-02', loan_type: 'Unsubsidized', current_balance: 0, original_balance: 2000.00, interest_rate: 3.730, status: 'Paid Off', avalanche_priority: 99, snowball_priority: 99 },
  { id: 'demo-10', loan_id: '1-04', loan_type: 'Unsubsidized', current_balance: 0, original_balance: 2000.00, interest_rate: 4.450, status: 'Paid Off', avalanche_priority: 99, snowball_priority: 99 },
]

export const DEMO_BUDGET = [
  { id: 'b1', key: 'gross_annual_salary', value: 95000 },
  { id: 'b2', key: 'tax_rate', value: 28 },
  { id: 'b3', key: 'other_monthly_income', value: 0 },
  { id: 'b4', key: 'minimum_loan_payment', value: 850 },
  { id: 'b5', key: 'extra_debt_pct', value: 60 },
]

export const DEMO_EXPENSES = [
  { id: 'e1', name: 'Rent', amount: 1800, category: 'fixed', sort_order: 1 },
  { id: 'e2', name: 'Car Payment', amount: 450, category: 'fixed', sort_order: 2 },
  { id: 'e3', name: 'Car Insurance', amount: 165, category: 'fixed', sort_order: 3 },
  { id: 'e4', name: 'Utilities', amount: 195, category: 'fixed', sort_order: 4 },
  { id: 'e5', name: 'Groceries', amount: 480, category: 'variable', sort_order: 5 },
  { id: 'e6', name: 'Health Insurance', amount: 210, category: 'fixed', sort_order: 6 },
  { id: 'e7', name: 'Phone / Internet', amount: 135, category: 'fixed', sort_order: 7 },
  { id: 'e8', name: 'Subscriptions', amount: 45, category: 'variable', sort_order: 8 },
  { id: 'e9', name: 'Gas / Transport', amount: 160, category: 'variable', sort_order: 9 },
]

// Generate realistic payment history: Oct 2022 - Feb 2026
export function generateDemoPayments() {
  const payments = []
  let pid = 1

  // Helper to add a payment
  function addPay(date, loanId, amount, principal, interest, newBalance) {
    payments.push({
      id: `p${pid++}`,
      payment_date: date,
      loan_id: loanId,
      amount: Math.round(amount * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      new_balance: Math.round(newBalance * 100) / 100,
      notes: 'PAYMENT',
    })
  }

  // Phase 1: Oct 2022 - Jun 2023 (Standard payments ~$850/mo split across loans)
  const phase1Months = [
    '2022-10', '2022-11', '2022-12', '2023-01', '2023-02', '2023-03',
    '2023-04', '2023-05', '2023-06',
  ]
  let bal = {
    '1-01': 3420, '1-02': 1950, '1-03': 4380, '1-04': 1910,
    '1-05': 5350, '1-06': 6820,
    '2-01': 20500, '2-02': 20500, '2-03': 22000, '2-04': 15000,
  }
  const rates = { '1-01': 3.73, '1-02': 3.73, '1-03': 4.45, '1-04': 4.45, '1-05': 5.05, '1-06': 5.05, '2-01': 5.28, '2-02': 4.99, '2-03': 6.28, '2-04': 7.54 }

  for (const month of phase1Months) {
    // Proportional minimum payments
    const totalBal = Object.values(bal).reduce((s, b) => s + b, 0)
    const monthlyPay = 850
    for (const [lid, b] of Object.entries(bal)) {
      if (b <= 0) continue
      const share = (b / totalBal) * monthlyPay
      const intAmt = b * (rates[lid] / 100) / 12
      const prinAmt = Math.max(0, share - intAmt)
      bal[lid] = Math.max(0, b - prinAmt)
      addPay(`${month}-28`, lid, share, prinAmt, intAmt, bal[lid])
    }
  }

  // Phase 2: Jul - Dec 2023 (Raise to $95k, bumped to ~$1,100/mo)
  const phase2Months = ['2023-07', '2023-08', '2023-09', '2023-10', '2023-11', '2023-12']
  for (const month of phase2Months) {
    const totalBal = Object.values(bal).reduce((s, b) => s + b, 0)
    const monthlyPay = 1100
    for (const [lid, b] of Object.entries(bal)) {
      if (b <= 0) continue
      const share = (b / totalBal) * monthlyPay
      const intAmt = b * (rates[lid] / 100) / 12
      const prinAmt = Math.max(0, share - intAmt)
      bal[lid] = Math.max(0, b - prinAmt)
      addPay(`${month}-28`, lid, share, prinAmt, intAmt, bal[lid])
    }
  }

  // Phase 3: Jan 2024 - Lump sum to pay off 1-01 and 1-02
  const b101 = bal['1-01']
  const int101 = b101 * 0.0373 / 12
  addPay('2024-01-15', '1-01', b101 + int101, b101, int101, 0)
  bal['1-01'] = 0

  const b102 = bal['1-02']
  const int102 = b102 * 0.0373 / 12
  addPay('2024-01-15', '1-02', b102 + int102, b102, int102, 0)
  bal['1-02'] = 0

  // Phase 3b: Feb - Aug 2024 (Aggressive ~$1,500/mo on remaining loans, avalanche order)
  const phase3Months = ['2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08']
  for (const month of phase3Months) {
    let remaining = 1500
    // First: cover interest on all active loans
    const activeLids = Object.entries(bal).filter(([_, b]) => b > 0).sort((a, b) => rates[b[0]] - rates[a[0]])
    for (const [lid] of activeLids) {
      const intAmt = bal[lid] * (rates[lid] / 100) / 12
      addPay(`${month}-28`, lid, intAmt, 0, intAmt, bal[lid])
      remaining -= intAmt
    }
    // Then: extra to highest rate
    for (const [lid] of activeLids) {
      if (remaining <= 0 || bal[lid] <= 0) continue
      const prinAmt = Math.min(remaining, bal[lid])
      bal[lid] -= prinAmt
      addPay(`${month}-28`, lid, prinAmt, prinAmt, 0, bal[lid])
      remaining -= prinAmt
      if (bal[lid] <= 0) break
    }
  }

  // Phase 4: Sep 2024 - Lump sum $3,000 to pay off 1-04
  const b104 = bal['1-04']
  if (b104 > 0) {
    const int104 = b104 * 0.0445 / 12
    addPay('2024-09-10', '1-04', b104 + int104, b104, int104, 0)
    bal['1-04'] = 0
  }

  // Phase 5: Oct 2024 - Feb 2026 (Continued aggressive ~$1,800/mo)
  const phase5Months = [
    '2024-10', '2024-11', '2024-12',
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02',
  ]
  for (const month of phase5Months) {
    let remaining = 1800
    const activeLids = Object.entries(bal).filter(([_, b]) => b > 0).sort((a, b) => rates[b[0]] - rates[a[0]])
    for (const [lid] of activeLids) {
      const intAmt = bal[lid] * (rates[lid] / 100) / 12
      const minPay = Math.min(intAmt + 20, bal[lid] + intAmt) // cover interest + a little principal on each
      const pay = Math.min(remaining, minPay)
      const intPay = Math.min(intAmt, pay)
      const prinPay = Math.max(0, pay - intPay)
      bal[lid] = Math.max(0, bal[lid] - prinPay)
      addPay(`${month}-28`, lid, pay, prinPay, intPay, bal[lid])
      remaining -= pay
    }
    // Remaining to highest rate
    for (const [lid] of activeLids) {
      if (remaining <= 0 || bal[lid] <= 0) continue
      const prinAmt = Math.min(remaining, bal[lid])
      bal[lid] -= prinAmt
      addPay(`${month}-28`, lid, prinAmt, prinAmt, 0, bal[lid])
      remaining -= prinAmt
    }
  }

  return payments
}

export const DEMO_PAYMENTS = generateDemoPayments()
