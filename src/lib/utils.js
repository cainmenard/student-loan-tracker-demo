// Format number as currency
export function fmtCurrency(n) {
  if (n == null || isNaN(n)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function fmtCurrencyExact(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function fmtPct(n, decimals = 2) {
  if (n == null || isNaN(n)) return '0%'
  return `${Number(n).toFixed(decimals)}%`
}

export function fmtDate(d) {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Compute weighted average interest rate
export function weightedAvgRate(loans) {
  const totalBal = loans.reduce((s, l) => s + Number(l.current_balance), 0)
  if (totalBal === 0) return 0
  const weighted = loans.reduce((s, l) => s + Number(l.current_balance) * Number(l.interest_rate), 0)
  return weighted / totalBal
}

// Compute full amortization schedule using avalanche method
export function computeAmortization(loans, monthlyPayment, startDate = null) {
  if (!loans.length || monthlyPayment <= 0) return []

  const start = startDate ? new Date(startDate) : new Date()
  start.setDate(1)
  if (!startDate) start.setMonth(start.getMonth() + 1)

  // Sort by interest rate descending (avalanche)
  const sorted = [...loans]
    .filter(l => l.status === 'Active' && Number(l.current_balance) > 0)
    .sort((a, b) => Number(b.interest_rate) - Number(a.interest_rate))

  const balances = {}
  const rates = {}
  const types = {}
  sorted.forEach(l => {
    balances[l.loan_id] = Number(l.current_balance)
    rates[l.loan_id] = Number(l.interest_rate) / 100
    types[l.loan_id] = l.loan_type
  })
  const order = sorted.map(l => l.loan_id)
  const origTotal = Object.values(balances).reduce((s, b) => s + b, 0)

  const schedule = []
  let cumInterest = 0
  let cumPrincipal = 0

  for (let month = 1; month <= 360; month++) {
    const totalBal = order.reduce((s, id) => s + Math.max(0, balances[id]), 0)
    if (totalBal <= 0.01) break

    // Calculate total interest this month
    let totalInterest = 0
    order.forEach(id => {
      if (balances[id] > 0) {
        totalInterest += balances[id] * rates[id] / 12
      }
    })

    const actualPayment = Math.min(monthlyPayment, totalBal + totalInterest)
    const principalPayment = actualPayment - totalInterest

    // Apply interest to each loan, then pay down in priority order
    let remaining = actualPayment
    // First: pay all accrued interest
    order.forEach(id => {
      if (balances[id] > 0) {
        const interest = balances[id] * rates[id] / 12
        remaining -= interest
      }
    })

    // Then: pay principal in avalanche order
    for (const id of order) {
      if (balances[id] > 0 && remaining > 0) {
        const pay = Math.min(balances[id], remaining)
        balances[id] -= pay
        remaining -= pay
      }
    }

    cumInterest += totalInterest
    cumPrincipal += principalPayment
    const newTotal = order.reduce((s, id) => s + Math.max(0, balances[id]), 0)

    // Balances by type
    const byType = { 'Grad PLUS': 0, 'Unsubsidized': 0, 'Subsidized': 0 }
    order.forEach(id => { byType[types[id]] = (byType[types[id]] || 0) + Math.max(0, balances[id]) })

    const loansRemaining = order.filter(id => balances[id] > 0.01).length
    const pctPaid = 1 - (newTotal / origTotal)

    const d = new Date(start)
    d.setMonth(d.getMonth() + month - 1)

    schedule.push({
      month,
      date: d.toISOString().slice(0, 10),
      payment: Math.round(actualPayment * 100) / 100,
      interest: Math.round(totalInterest * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      totalBalance: Math.round(newTotal * 100) / 100,
      cumInterest: Math.round(cumInterest * 100) / 100,
      cumPrincipal: Math.round(cumPrincipal * 100) / 100,
      gradPlusBal: Math.round(byType['Grad PLUS'] * 100) / 100,
      unsubBal: Math.round(byType['Unsubsidized'] * 100) / 100,
      subBal: Math.round(byType['Subsidized'] * 100) / 100,
      loansRemaining,
      pctPaid: Math.round(pctPaid * 1000) / 10,
    })

    if (newTotal <= 0.01) break
  }

  return schedule
}

// Compute a single scenario summary
export function computeScenarioSummary(loans, monthlyPayment) {
  const schedule = computeAmortization(loans, monthlyPayment)
  if (!schedule.length) return { months: 0, totalInterest: 0, totalPaid: 0, payoffDate: '' }
  const last = schedule[schedule.length - 1]
  return {
    months: last.month,
    totalInterest: last.cumInterest,
    totalPaid: last.cumInterest + last.cumPrincipal,
    payoffDate: last.date,
  }
}
