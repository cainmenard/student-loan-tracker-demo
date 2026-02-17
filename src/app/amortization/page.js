'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrency, fmtCurrencyExact, fmtDate, fmtPct, computeAmortization } from '@/lib/utils'
import dynamic from 'next/dynamic'

const Chart = dynamic(() => import('@/components/AmortChart'), { ssr: false })

export default function AmortizationPage() {
  const [loans, setLoans] = useState([])
  const [budget, setBudget] = useState({})
  const [expenses, setExpenses] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [lRes, bRes, eRes, pRes] = await Promise.all([
        supabase.from('loans').select('*').order('avalanche_priority'),
        supabase.from('budget_config').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('payments').select('*').order('payment_date', { ascending: true }),
      ])
      setLoans(lRes.data || [])
      const bMap = {}
      ;(bRes.data || []).forEach(r => { bMap[r.key] = Number(r.value) })
      setBudget(bMap)
      setExpenses(eRes.data || [])
      setPayments(pRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const monthlyPayment = useMemo(() => {
    const grossSalary = budget.gross_annual_salary || 0
    const taxRate = (budget.tax_rate || 25) / 100
    const otherIncome = budget.other_monthly_income || 0
    const monthlyNet = (grossSalary * (1 - taxRate)) / 12 + otherIncome
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0)
    const minPayment = budget.minimum_loan_payment || 1200
    const extraPct = (budget.extra_debt_pct || 50) / 100
    return minPayment + ((monthlyNet - totalExp) * extraPct)
  }, [budget, expenses])

  // Actual payment history aggregated by month
  const actualHistory = useMemo(() => {
    if (payments.length === 0) return []
    const activeLoans = loans.filter(l => l.status === 'Active')
    const totalBorrowed = activeLoans.reduce((s, l) => s + Number(l.current_balance), 0)
      + payments.reduce((s, p) => s + Number(p.principal), 0)

    const byMonth = {}
    payments.forEach(p => {
      const d = new Date(p.payment_date + 'T00:00:00')
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { payment: 0, interest: 0, principal: 0 }
      byMonth[key].payment += Number(p.amount)
      byMonth[key].interest += Number(p.interest)
      byMonth[key].principal += Number(p.principal)
    })

    const result = []
    let cumInterest = 0, cumPrincipal = 0
    Object.keys(byMonth).sort().forEach((key, i) => {
      const m = byMonth[key]
      cumInterest += m.interest
      cumPrincipal += m.principal
      result.push({
        month: i + 1,
        date: key + '-01',
        payment: Math.round(m.payment * 100) / 100,
        interest: Math.round(m.interest * 100) / 100,
        principal: Math.round(m.principal * 100) / 100,
        totalBalance: Math.round((totalBorrowed - cumPrincipal) * 100) / 100,
        cumInterest: Math.round(cumInterest * 100) / 100,
        cumPrincipal: Math.round(cumPrincipal * 100) / 100,
        isActual: true,
      })
    })
    return result
  }, [payments, loans])

  // Projected schedule from current balances forward
  const projectedSchedule = useMemo(() => {
    const active = loans.filter(l => l.status === 'Active' && Number(l.current_balance) > 0)
    return computeAmortization(active, monthlyPayment)
  }, [loans, monthlyPayment])

  // Combined: actual history + projected future (with correct month numbering)
  const combinedSchedule = useMemo(() => {
    const lastActual = actualHistory[actualHistory.length - 1]
    const actualCumInterest = lastActual?.cumInterest || 0
    const actualCumPrincipal = lastActual?.cumPrincipal || 0
    const actualMonths = actualHistory.length

    const projected = projectedSchedule.map(row => ({
      ...row,
      month: actualMonths + row.month,
      cumInterest: Math.round((actualCumInterest + row.cumInterest) * 100) / 100,
      cumPrincipal: Math.round((actualCumPrincipal + row.cumPrincipal) * 100) / 100,
      isActual: false,
    }))

    return [...actualHistory, ...projected]
  }, [actualHistory, projectedSchedule])

  // Chart data (sampled for performance)
  const chartSchedule = useMemo(() => {
    return combinedSchedule.filter((_, i) => i === 0 || i === combinedSchedule.length - 1 || i % 2 === 0)
  }, [combinedSchedule])

  const activeLoans = loans.filter(l => l.status === 'Active')
  const totalDebt = activeLoans.reduce((s, l) => s + Number(l.current_balance), 0)
  const lifetimePrincipal = payments.reduce((s, p) => s + Number(p.principal), 0)
  const lifetimeInterest = payments.reduce((s, p) => s + Number(p.interest), 0)
  const lastProjected = projectedSchedule[projectedSchedule.length - 1]
  const lastCombined = combinedSchedule[combinedSchedule.length - 1]

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-7xl mx-auto" />

  return (
    <div className="max-w-7xl mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-700">Amortization Schedule</h1>
        <p className="text-gray-500 mt-1">Actual payment history + projected payoff using Avalanche method</p>
      </div>

      {/* Key summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="metric-card">
          <span className="metric-label">Monthly Payment</span>
          <span className="metric-value text-green-600">{fmtCurrency(monthlyPayment)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Current Balance</span>
          <span className="metric-value text-red-600">{fmtCurrency(totalDebt)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Months Remaining</span>
          <span className="metric-value text-navy-700">{lastProjected?.month || '—'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Projected Payoff</span>
          <span className="metric-value text-navy-700 text-lg">{lastProjected ? fmtDate(lastProjected.date) : '—'}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Lifetime Interest</span>
          <span className="metric-value text-orange-600">{fmtCurrency(lifetimeInterest + (lastProjected?.cumInterest || 0))}</span>
          <span className="text-xs text-gray-500">{fmtCurrency(lifetimeInterest)} paid + {fmtCurrency(lastProjected?.cumInterest || 0)} remaining</span>
        </div>
      </div>

      {/* Chart */}
      {chartSchedule.length > 0 && <Chart schedule={chartSchedule} />}

      {/* History vs Projected summary */}
      <div className="grid grid-cols-2 gap-4 mt-6 mb-6">
        <div className="card p-5 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-3">Actual History</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Months of payments:</span> <span className="font-semibold">{actualHistory.length}</span></div>
            <div><span className="text-gray-500">Total paid:</span> <span className="font-semibold">{fmtCurrency(lifetimePrincipal + lifetimeInterest)}</span></div>
            <div><span className="text-gray-500">Principal paid:</span> <span className="font-semibold text-green-700">{fmtCurrency(lifetimePrincipal)}</span></div>
            <div><span className="text-gray-500">Interest paid:</span> <span className="font-semibold text-red-600">{fmtCurrency(lifetimeInterest)}</span></div>
          </div>
        </div>
        <div className="card p-5 border-l-4 border-orange-500">
          <h3 className="text-sm font-semibold text-orange-800 uppercase tracking-wider mb-3">Projected Remaining</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Months left:</span> <span className="font-semibold">{lastProjected?.month || 0}</span></div>
            <div><span className="text-gray-500">Total remaining:</span> <span className="font-semibold">{fmtCurrency(totalDebt + (lastProjected?.cumInterest || 0))}</span></div>
            <div><span className="text-gray-500">Principal left:</span> <span className="font-semibold text-green-700">{fmtCurrency(totalDebt)}</span></div>
            <div><span className="text-gray-500">Interest left:</span> <span className="font-semibold text-red-600">{fmtCurrency(lastProjected?.cumInterest || 0)}</span></div>
          </div>
        </div>
      </div>

      {/* Projected schedule table */}
      <div className="card overflow-x-auto">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Projected Payoff Schedule (from current balance)</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Date</th><th className="text-right">Payment</th>
              <th className="text-right">Interest</th><th className="text-right">Principal</th>
              <th className="text-right">Balance</th><th className="text-right">Loans Left</th>
              <th className="text-right">% Paid</th>
            </tr>
          </thead>
          <tbody>
            {projectedSchedule.map(row => (
              <tr key={row.month} className={row.totalBalance <= 0.01 ? 'bg-green-50' : ''}>
                <td className="font-medium text-gray-600">{row.month}</td>
                <td>{fmtDate(row.date)}</td>
                <td className="text-right font-medium">{fmtCurrencyExact(row.payment)}</td>
                <td className="text-right text-orange-600">{fmtCurrencyExact(row.interest)}</td>
                <td className="text-right text-green-700">{fmtCurrencyExact(row.principal)}</td>
                <td className="text-right font-semibold">{fmtCurrencyExact(row.totalBalance)}</td>
                <td className="text-right">{row.loansRemaining}</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${row.pctPaid}%` }} />
                    </div>
                    <span className="text-xs font-medium">{row.pctPaid}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
