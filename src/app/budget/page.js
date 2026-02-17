'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrency, fmtCurrencyExact } from '@/lib/utils'

export default function BudgetPage() {
  const [config, setConfig] = useState({})
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('')
  const [newExpense, setNewExpense] = useState({ label: '', amount: '' })

  const load = useCallback(async () => {
    const [bRes, eRes] = await Promise.all([
      supabase.from('budget_config').select('*'),
      supabase.from('expenses').select('*').order('sort_order'),
    ])
    const bMap = {}
    ;(bRes.data || []).forEach(r => { bMap[r.key] = Number(r.value) })
    setConfig(bMap)
    setExpenses(eRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateConfig(key, value) {
    setSaveStatus('Saving...')
    await supabase.from('budget_config').update({ value: Number(value) }).eq('key', key)
    setConfig(prev => ({ ...prev, [key]: Number(value) }))
    setSaveStatus('Saved ✓')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  async function updateExpense(id, field, value) {
    setSaveStatus('Saving...')
    await supabase.from('expenses').update({ [field]: field === 'amount' ? Number(value) : value }).eq('id', id)
    await load()
    setSaveStatus('Saved ✓')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  async function addExpense() {
    if (!newExpense.label) return
    const maxOrder = Math.max(0, ...expenses.map(e => e.sort_order || 0))
    await supabase.from('expenses').insert({
      label: newExpense.label,
      amount: Number(newExpense.amount) || 0,
      category: 'fixed',
      sort_order: maxOrder + 1,
    })
    setNewExpense({ label: '', amount: '' })
    await load()
  }

  async function deleteExpense(id) {
    await supabase.from('expenses').delete().eq('id', id)
    await load()
  }

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-4xl mx-auto" />

  // Derived calculations
  const grossSalary = config.gross_annual_salary || 0
  const taxRate = (config.tax_rate || 25) / 100
  const annualNet = grossSalary * (1 - taxRate)
  const monthlyNet = annualNet / 12
  const otherIncome = config.other_monthly_income || 0
  const totalMonthlyIncome = monthlyNet + otherIncome
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const minPayment = config.minimum_loan_payment || 0
  const remainingAfterExpenses = totalMonthlyIncome - totalExpenses
  const extraPct = (config.extra_debt_pct || 0) / 100
  const extraPayment = remainingAfterExpenses * extraPct
  const totalDebtPayment = minPayment + extraPayment
  const remainingAfterAll = totalMonthlyIncome - totalExpenses - totalDebtPayment

  return (
    <div className="max-w-4xl mx-auto animate-in">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-navy-700">Monthly Budget</h1>
          <p className="text-gray-500 mt-1">Edit blue cells to update your budget. Changes save automatically.</p>
        </div>
        {saveStatus && (
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${
            saveStatus === 'Saving...' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
          }`}>{saveStatus}</span>
        )}
      </div>

      {/* Income Section */}
      <div className="card mb-6">
        <div className="card-header bg-navy-700">
          <h2 className="text-white font-semibold">Income</h2>
        </div>
        <div className="p-6 space-y-4">
          <BudgetRow label="Gross Annual Salary" value={config.gross_annual_salary}
            onChange={v => updateConfig('gross_annual_salary', v)} format="currency" />
          <BudgetRow label="Estimated Tax Rate (%)" value={config.tax_rate}
            onChange={v => updateConfig('tax_rate', v)} format="pct" />
          <div className="flex justify-between items-center py-2 border-t border-gray-100">
            <span className="font-semibold text-gray-700">Annual Net Income</span>
            <span className="font-bold text-navy-700">{fmtCurrency(annualNet)}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="font-semibold text-gray-700">Monthly Net Income</span>
            <span className="font-bold text-navy-700">{fmtCurrency(monthlyNet)}</span>
          </div>
          <BudgetRow label="Other Monthly Income" value={config.other_monthly_income}
            onChange={v => updateConfig('other_monthly_income', v)} format="currency" />
          <div className="flex justify-between items-center py-3 bg-green-50 px-4 rounded-lg">
            <span className="font-bold text-green-800">Total Monthly Income</span>
            <span className="font-bold text-green-700 text-xl">{fmtCurrency(totalMonthlyIncome)}</span>
          </div>
          <BudgetRow label="Annual Salary Increase (%)" value={config.annual_raise_pct}
            onChange={v => updateConfig('annual_raise_pct', v)} format="pct" />
        </div>
      </div>

      {/* Expenses Section */}
      <div className="card mb-6">
        <div className="card-header bg-navy-700">
          <h2 className="text-white font-semibold">Fixed Monthly Expenses</h2>
        </div>
        <div className="p-6 space-y-3">
          {expenses.map(exp => (
            <div key={exp.id} className="flex items-center gap-3">
              <input
                value={exp.label}
                onChange={e => updateExpense(exp.id, 'label', e.target.value)}
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="number"
                step="0.01"
                value={exp.amount}
                onChange={e => updateExpense(exp.id, 'amount', e.target.value)}
                className="input-cell w-36"
              />
              <button onClick={() => deleteExpense(exp.id)}
                className="text-gray-400 hover:text-red-600 transition" title="Remove">✕</button>
            </div>
          ))}
          {/* Add expense row */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <input placeholder="New expense label..." value={newExpense.label}
              onChange={e => setNewExpense({ ...newExpense, label: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addExpense()}
              className="flex-1 text-sm px-3 py-2 border border-dashed border-gray-300 rounded-lg focus:border-blue-400" />
            <input placeholder="$0.00" type="number" step="0.01" value={newExpense.amount}
              onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addExpense()}
              className="input-cell w-36 opacity-70" />
            <button onClick={addExpense}
              className="text-green-600 hover:text-green-700 font-bold text-lg" title="Add">+</button>
          </div>
          <div className="flex justify-between items-center py-3 bg-red-50 px-4 rounded-lg mt-3">
            <span className="font-bold text-red-800">Total Fixed Expenses</span>
            <span className="font-bold text-red-700 text-xl">{fmtCurrency(totalExpenses)}</span>
          </div>
        </div>
      </div>

      {/* Debt Allocation Section */}
      <div className="card mb-6">
        <div className="card-header bg-navy-700">
          <h2 className="text-white font-semibold">Debt Payment Allocation</h2>
        </div>
        <div className="p-6 space-y-4">
          <BudgetRow label="Estimated Minimum Payment (all loans)" value={config.minimum_loan_payment}
            onChange={v => updateConfig('minimum_loan_payment', v)} format="currency" />
          <div className="flex justify-between items-center py-2 border-t border-gray-100">
            <span className="font-semibold text-gray-700">Remaining After Expenses</span>
            <span className={`font-bold ${remainingAfterExpenses >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtCurrency(remainingAfterExpenses)}
            </span>
          </div>
          <BudgetRow label="% of Remaining → Extra Debt Payment" value={config.extra_debt_pct}
            onChange={v => updateConfig('extra_debt_pct', v)} format="pct" />
          <div className="flex justify-between items-center py-2">
            <span className="font-semibold text-gray-700">Extra Monthly Payment</span>
            <span className="font-bold text-green-600">{fmtCurrency(extraPayment)}</span>
          </div>
          <div className="flex justify-between items-center py-3 bg-blue-50 px-4 rounded-lg">
            <span className="font-bold text-navy-800">TOTAL MONTHLY DEBT PAYMENT</span>
            <span className="font-bold text-navy-700 text-xl">{fmtCurrency(totalDebtPayment)}</span>
          </div>
        </div>
      </div>

      {/* Savings Section */}
      <div className="card mb-6">
        <div className="card-header bg-navy-700">
          <h2 className="text-white font-semibold">Savings & Remaining</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className={`flex justify-between items-center py-3 px-4 rounded-lg ${
            remainingAfterAll >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <span className="font-bold">Remaining After All Obligations</span>
            <span className={`font-bold text-xl ${remainingAfterAll >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtCurrency(remainingAfterAll)}
            </span>
          </div>
          <BudgetRow label="Emergency Fund Target" value={config.emergency_fund_target}
            onChange={v => updateConfig('emergency_fund_target', v)} format="currency" />
          <BudgetRow label="Current Emergency Fund" value={config.current_emergency_fund}
            onChange={v => updateConfig('current_emergency_fund', v)} format="currency" />
          <BudgetRow label="Monthly Savings Target" value={config.monthly_savings_target}
            onChange={v => updateConfig('monthly_savings_target', v)} format="currency" />
        </div>
      </div>
    </div>
  )
}

function BudgetRow({ label, value, onChange, format }) {
  const [editing, setEditing] = useState(false)
  const [localVal, setLocalVal] = useState(value ?? 0)

  useEffect(() => { setLocalVal(value ?? 0) }, [value])

  function commit() {
    setEditing(false)
    if (Number(localVal) !== Number(value)) {
      onChange(localVal)
    }
  }

  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm text-gray-700">{label}</span>
      {editing ? (
        <input
          type="number"
          step={format === 'pct' ? '0.1' : '0.01'}
          value={localVal}
          autoFocus
          onChange={e => setLocalVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          className="input-cell w-40"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className="cursor-pointer text-blue-700 font-semibold hover:bg-yellow-100 px-3 py-1 rounded transition"
        >
          {format === 'currency' ? fmtCurrencyExact(value ?? 0) : `${Number(value ?? 0).toFixed(1)}%`}
        </span>
      )}
    </div>
  )
}
