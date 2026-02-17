'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrency, fmtDate, computeScenarioSummary } from '@/lib/utils'
import dynamic from 'next/dynamic'

const ScenarioChart = dynamic(() => import('@/components/ScenarioChart'), { ssr: false })

export default function ScenariosPage() {
  const [loans, setLoans] = useState([])
  const [budget, setBudget] = useState({})
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [customAmount, setCustomAmount] = useState(2000)

  useEffect(() => {
    async function load() {
      const [lRes, bRes, eRes] = await Promise.all([
        supabase.from('loans').select('*').order('avalanche_priority'),
        supabase.from('budget_config').select('*'),
        supabase.from('expenses').select('*'),
      ])
      setLoans(lRes.data || [])
      const bMap = {}
      ;(bRes.data || []).forEach(r => { bMap[r.key] = Number(r.value) })
      setBudget(bMap)
      setExpenses(eRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const currentPayment = useMemo(() => {
    const grossSalary = budget.gross_annual_salary || 0
    const taxRate = (budget.tax_rate || 25) / 100
    const otherIncome = budget.other_monthly_income || 0
    const monthlyNet = (grossSalary * (1 - taxRate)) / 12 + otherIncome
    const totalExp = expenses.reduce((s, e) => s + Number(e.amount), 0)
    const minPayment = budget.minimum_loan_payment || 1200
    const extraPct = (budget.extra_debt_pct || 50) / 100
    const remaining = monthlyNet - totalExp
    return minPayment + (remaining * extraPct)
  }, [budget, expenses])

  const activeLoans = loans.filter(l => l.status === 'Active' && Number(l.current_balance) > 0)

  const scenarios = useMemo(() => {
    if (!activeLoans.length) return []
    const amounts = [
      { label: 'Minimum Only', amount: budget.minimum_loan_payment || 1200 },
      { label: `Current Plan`, amount: Math.round(currentPayment) },
      { label: 'Aggressive', amount: 2500 },
      { label: 'Very Aggressive', amount: 3000 },
      { label: 'Maximum', amount: 4000 },
      { label: 'Custom', amount: Number(customAmount) || 0 },
    ]
    return amounts.map(s => ({
      ...s,
      ...computeScenarioSummary(activeLoans, s.amount),
    }))
  }, [activeLoans, budget, currentPayment, customAmount])

  const minInterest = scenarios.length > 0 ? scenarios[0].totalInterest : 0

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-7xl mx-auto" />

  return (
    <div className="max-w-7xl mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-700">What-If Scenarios</h1>
        <p className="text-gray-500 mt-1">Compare different payment amounts to see the impact on your payoff timeline.</p>
      </div>

      {/* Custom amount input */}
      <div className="card mb-8 p-6">
        <div className="flex items-center gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Custom Monthly Payment</label>
            <p className="text-xs text-gray-500">Drag the slider or type an amount to model a custom scenario.</p>
          </div>
          <div className="flex-1">
            <input
              type="range"
              min={500}
              max={6000}
              step={100}
              value={customAmount}
              onChange={e => setCustomAmount(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-navy-700"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>$500</span>
              <span>$6,000</span>
            </div>
          </div>
          <input
            type="number"
            step={100}
            value={customAmount}
            onChange={e => setCustomAmount(Number(e.target.value))}
            className="input-cell w-32"
          />
        </div>
      </div>

      {/* Comparison table */}
      <div className="card overflow-x-auto mb-8">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Scenario Comparison</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th className="text-right">Monthly Payment</th>
              <th className="text-right">Months to Payoff</th>
              <th className="text-right">Payoff Date</th>
              <th className="text-right">Total Interest</th>
              <th className="text-right">Total Paid</th>
              <th className="text-right">Interest Savings</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => {
              const savings = minInterest - s.totalInterest
              const isCurrent = s.label === 'Current Plan'
              const isCustom = s.label === 'Custom'
              return (
                <tr key={i} className={isCurrent ? 'bg-blue-50 font-semibold' : isCustom ? 'bg-yellow-50' : ''}>
                  <td>
                    <div className="flex items-center gap-2">
                      {isCurrent && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                      {isCustom && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                      <span className={isCurrent ? 'text-blue-700' : isCustom ? 'text-yellow-700' : ''}>
                        {s.label}
                      </span>
                    </div>
                  </td>
                  <td className="text-right font-semibold">{fmtCurrency(s.amount)}</td>
                  <td className="text-right">{s.months}</td>
                  <td className="text-right">{s.months > 0 ? fmtDate(s.payoffDate) : '—'}</td>
                  <td className="text-right text-orange-600">{fmtCurrency(s.totalInterest)}</td>
                  <td className="text-right">{fmtCurrency(s.totalPaid)}</td>
                  <td className="text-right">
                    {savings > 0 ? (
                      <span className="text-green-600 font-bold">+{fmtCurrency(savings)}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Visual comparison */}
      {scenarios.length > 0 && <ScenarioChart scenarios={scenarios} />}

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="card p-6 border-l-4 border-green-500">
          <h3 className="font-semibold text-green-800 mb-2">Avalanche Method Advantage</h3>
          <p className="text-sm text-gray-600">
            By targeting the highest interest rate loans first (Grad PLUS at 5.3%, then 2-01 at 5.28%),
            you reduce the total interest accruing each month. This approach saves the most money over
            the life of your loans compared to paying minimums everywhere equally.
          </p>
        </div>
        <div className="card p-6 border-l-4 border-blue-500">
          <h3 className="font-semibold text-blue-800 mb-2">Every Dollar Counts</h3>
          <p className="text-sm text-gray-600">
            {scenarios.length >= 3 && scenarios[2].months > 0 ? (
              <>
                Going from {fmtCurrency(scenarios[0].amount)}/mo to {fmtCurrency(scenarios[2].amount)}/mo
                saves you {fmtCurrency(minInterest - scenarios[2].totalInterest)} in interest
                and cuts {scenarios[0].months - scenarios[2].months} months off your timeline.
              </>
            ) : (
              'Increasing your monthly payment even by a small amount can significantly reduce your total interest and payoff time.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
