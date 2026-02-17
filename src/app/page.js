'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrency, fmtPct, fmtDate, weightedAvgRate, computeScenarioSummary } from '@/lib/utils'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const ProgressChart = dynamic(() => import('@/components/ProgressChart'), { ssr: false })

export default function Dashboard() {
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
        supabase.from('expenses').select('*').order('sort_order'),
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

  const activeLoans = useMemo(() => loans.filter(l => l.status === 'Active'), [loans])
  const paidOffLoans = useMemo(() => loans.filter(l => l.status === 'Paid Off'), [loans])
  const totalDebt = useMemo(() => activeLoans.reduce((s, l) => s + Number(l.current_balance), 0), [activeLoans])
  const avgRate = useMemo(() => weightedAvgRate(activeLoans), [activeLoans])

  const lifetimeStats = useMemo(() => {
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
    const principalPaid = payments.reduce((s, p) => s + Number(p.principal), 0)
    const interestPaid = payments.reduce((s, p) => s + Number(p.interest), 0)
    return { totalPaid, principalPaid, interestPaid }
  }, [payments])

  const netBorrowed = useMemo(() => totalDebt + lifetimeStats.principalPaid, [totalDebt, lifetimeStats])
  const paidOffPct = netBorrowed > 0 ? ((netBorrowed - totalDebt) / netBorrowed) * 100 : 0

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

  const projection = useMemo(() => computeScenarioSummary(activeLoans, monthlyPayment), [activeLoans, monthlyPayment])

  const monthlyChartData = useMemo(() => {
    if (payments.length === 0) return []
    const byMonth = {}
    payments.forEach(p => {
      const d = new Date(p.payment_date + 'T00:00:00')
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { paid: 0, principalPaid: 0, interestPaid: 0 }
      byMonth[key].paid += Number(p.amount)
      byMonth[key].principalPaid += Number(p.principal)
      byMonth[key].interestPaid += Number(p.interest)
    })
    const result = []
    let cumPrincipal = 0, cumInterest = 0
    Object.keys(byMonth).sort().forEach(key => {
      const m = byMonth[key]
      cumPrincipal += m.principalPaid
      cumInterest += m.interestPaid
      const mo = parseInt(key.split('-')[1])
      const yr = key.split('-')[0].slice(2)
      result.push({
        label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1]} ${yr}`,
        paid: Math.round(m.paid),
        principalPaid: Math.round(m.principalPaid),
        interestPaid: Math.round(m.interestPaid),
        cumPrincipal: Math.round(cumPrincipal),
        cumInterest: Math.round(cumInterest),
        balance: Math.round(netBorrowed - cumPrincipal),
      })
    })
    return result
  }, [payments, netBorrowed])

  const budgetSummary = useMemo(() => {
    const grossSalary = budget.gross_annual_salary || 0
    const taxRate = (budget.tax_rate || 25) / 100
    const otherIncome = budget.other_monthly_income || 0
    const monthlyNet = (grossSalary * (1 - taxRate)) / 12 + otherIncome
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0)
    return { monthlyNet, totalExp, remaining: monthlyNet - totalExp - monthlyPayment }
  }, [budget, expenses, monthlyPayment])

  const byType = useMemo(() => {
    const groups = {}
    activeLoans.forEach(l => {
      if (!groups[l.loan_type]) groups[l.loan_type] = { count: 0, balance: 0, rates: [] }
      groups[l.loan_type].count++
      groups[l.loan_type].balance += Number(l.current_balance)
      groups[l.loan_type].rates.push(Number(l.interest_rate))
    })
    return groups
  }, [activeLoans])

  const typeColors = { 'Grad PLUS': 'bg-red-500', 'Unsubsidized': 'bg-orange-500', 'Subsidized': 'bg-blue-500' }

  if (loading) return <DashboardSkeleton />

  return (
    <div className="max-w-7xl mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-700">Dashboard</h1>
        <p className="text-gray-500 mt-1">Your student loan payoff at a glance</p>
      </div>

      {/* Lifetime Progress Banner */}
      <div className="card mb-8 overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-navy-700 to-navy-500 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Lifetime Payoff Progress</h2>
              <p className="text-blue-200 text-sm">
                Net borrowed: {fmtCurrency(netBorrowed)} &middot; {paidOffLoans.length} loans paid off &middot; {activeLoans.length} remaining
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{paidOffPct.toFixed(1)}%</p>
              <p className="text-blue-200 text-xs">of principal eliminated</p>
            </div>
          </div>
          <div className="w-full h-4 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all duration-1000" style={{ width: `${paidOffPct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
            <div>
              <p className="text-2xl font-bold">{fmtCurrency(lifetimeStats.totalPaid)}</p>
              <p className="text-blue-200 text-xs">Total Paid</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{fmtCurrency(lifetimeStats.principalPaid)}</p>
              <p className="text-blue-200 text-xs">To Principal</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-300">{fmtCurrency(lifetimeStats.interestPaid)}</p>
              <p className="text-blue-200 text-xs">To Interest</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="metric-card">
          <span className="metric-label">Remaining Debt</span>
          <span className="metric-value text-red-600">{fmtCurrency(totalDebt)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Monthly Payment</span>
          <span className="metric-value text-green-600">{fmtCurrency(monthlyPayment)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Projected Payoff</span>
          <span className="metric-value text-navy-700">{projection.months > 0 ? fmtDate(projection.payoffDate) : '—'}</span>
          <span className="text-xs text-gray-500">{projection.months} months remaining</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Remaining Interest</span>
          <span className="metric-value text-orange-600">{fmtCurrency(projection.totalInterest)}</span>
          <span className="text-xs text-gray-500">Weighted avg: {fmtPct(avgRate)}</span>
        </div>
      </div>

      {/* Payment History Chart */}
      {monthlyChartData.length > 0 && <div className="mb-8"><ProgressChart monthlyData={monthlyChartData} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Debt by Type */}
        <div className="card col-span-1">
          <div className="card-header"><h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Active Debt by Type</h2></div>
          <div className="p-6 space-y-4">
            {Object.entries(byType).map(([type, data]) => (
              <div key={type}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">{type}</span>
                  <span className="text-sm font-semibold">{fmtCurrency(data.balance)}</span>
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${typeColors[type] || 'bg-gray-400'}`}
                    style={{ width: `${totalDebt > 0 ? (data.balance / totalDebt) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-500">{data.count} loans</span>
                  <span className="text-xs text-gray-500">Avg {fmtPct(data.rates.reduce((s, r) => s + r, 0) / data.rates.length)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Avalanche Priority */}
        <div className="card col-span-1">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Payoff Priority</h2>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Avalanche</span>
          </div>
          <div className="p-4 space-y-2">
            {activeLoans.slice(0, 8).map((loan, i) => (
              <div key={loan.id} className="flex items-center gap-3 py-1">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{loan.loan_id}</span>
                  <span className="text-xs text-gray-500 ml-2">{loan.loan_type}</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">{fmtPct(loan.interest_rate)}</span>
              </div>
            ))}
            {activeLoans.length > 8 && <Link href="/loans" className="text-xs text-blue-600 hover:underline">+{activeLoans.length - 8} more →</Link>}
          </div>
        </div>

        {/* Quick Budget */}
        <div className="card col-span-1">
          <div className="card-header"><h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Monthly Budget</h2></div>
          <div className="p-6 space-y-3">
            <div className="flex justify-between"><span className="text-sm text-gray-600">Net Income</span><span className="text-sm font-semibold text-green-700">{fmtCurrency(budgetSummary.monthlyNet)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Fixed Expenses</span><span className="text-sm font-semibold text-red-600">-{fmtCurrency(budgetSummary.totalExp)}</span></div>
            <div className="flex justify-between"><span className="text-sm text-gray-600">Debt Payments</span><span className="text-sm font-semibold text-orange-600">-{fmtCurrency(monthlyPayment)}</span></div>
            <hr className="border-gray-200" />
            <div className="flex justify-between">
              <span className="text-sm font-semibold text-gray-700">Remaining</span>
              <span className={`text-sm font-bold ${budgetSummary.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtCurrency(budgetSummary.remaining)}</span>
            </div>
            <Link href="/budget" className="block text-center text-xs text-blue-600 hover:underline mt-3">Edit Budget →</Link>
          </div>
        </div>
      </div>

      {/* Paid Off Loans */}
      {paidOffLoans.length > 0 && (
        <div className="card mb-8">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Paid Off Loans</h2>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">{paidOffLoans.length} eliminated</span>
          </div>
          <div className="p-4 flex flex-wrap gap-3">
            {paidOffLoans.map(l => (
              <div key={l.id} className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="text-green-600 text-sm">&#10003;</span>
                <span className="text-sm font-medium text-green-800">{l.loan_id}</span>
                <span className="text-xs text-green-600">{l.loan_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Payments */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Recent Payments</h2>
          <Link href="/payments" className="text-xs text-blue-600 hover:underline">View All →</Link>
        </div>
        {payments.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Date</th><th>Loan</th><th className="text-right">Amount</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Balance After</th></tr></thead>
            <tbody>
              {[...payments].reverse().slice(0, 8).map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.payment_date + 'T00:00:00').toLocaleDateString()}</td>
                  <td className="font-medium">{p.loan_id}</td>
                  <td className="text-right font-semibold">{fmtCurrency(p.amount)}</td>
                  <td className="text-right text-green-700">{fmtCurrency(p.principal)}</td>
                  <td className="text-right text-red-600">{fmtCurrency(p.interest)}</td>
                  <td className="text-right">{Number(p.new_balance) > 0 ? fmtCurrency(p.new_balance) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400"><p>No payments logged yet.</p></div>
        )}
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8"><div className="skeleton h-8 w-48 mb-2" /><div className="skeleton h-4 w-72" /></div>
      <div className="skeleton h-48 rounded-xl mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-8">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>
    </div>
  )
}
