'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrencyExact, fmtPct } from '@/lib/utils'

export default function LoansPage() {
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [showPaidOff, setShowPaidOff] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newLoan, setNewLoan] = useState({ loan_id: '', loan_type: 'Subsidized', current_balance: '', interest_rate: '', due_date: '2026-02-28' })

  const loadData = useCallback(async () => {
    const [lRes, pRes] = await Promise.all([
      supabase.from('loans').select('*').order('avalanche_priority'),
      supabase.from('payments').select('loan_id, amount, principal, interest'),
    ])
    setLoans(lRes.data || [])
    setPayments(pRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Aggregate payments by loan
  const paymentsByLoan = useMemo(() => {
    const map = {}
    payments.forEach(p => {
      if (!map[p.loan_id]) map[p.loan_id] = { count: 0, totalPaid: 0, principalPaid: 0, interestPaid: 0 }
      map[p.loan_id].count++
      map[p.loan_id].totalPaid += Number(p.amount)
      map[p.loan_id].principalPaid += Number(p.principal)
      map[p.loan_id].interestPaid += Number(p.interest)
    })
    return map
  }, [payments])

  async function updateLoan(id, field, value) {
    setSaving(id)
    const update = { [field]: value }
    if (field === 'current_balance' && Number(value) <= 0) update.status = 'Paid Off'
    await supabase.from('loans').update(update).eq('id', id)
    await loadData()
    setSaving(null)
  }

  async function addLoan() {
    if (!newLoan.loan_id || !newLoan.current_balance) return
    const maxPriority = Math.max(0, ...loans.map(l => l.avalanche_priority || 0))
    await supabase.from('loans').insert({
      ...newLoan, current_balance: Number(newLoan.current_balance),
      original_balance: Number(newLoan.current_balance), interest_rate: Number(newLoan.interest_rate),
      avalanche_priority: maxPriority + 1, snowball_priority: maxPriority + 1, status: 'Active',
    })
    setNewLoan({ loan_id: '', loan_type: 'Subsidized', current_balance: '', interest_rate: '', due_date: '2026-02-28' })
    setShowAdd(false)
    await loadData()
  }

  async function deleteLoan(id) {
    if (!confirm('Delete this loan? This cannot be undone.')) return
    await supabase.from('loans').delete().eq('id', id)
    await loadData()
  }

  const activeLoans = loans.filter(l => l.status === 'Active')
  const paidOffLoans = loans.filter(l => l.status === 'Paid Off')
  const totalBalance = activeLoans.reduce((s, l) => s + Number(l.current_balance), 0)
  const totalMonthlyInterest = activeLoans.reduce((s, l) => s + (Number(l.current_balance) * Number(l.interest_rate) / 100 / 12), 0)
  const totalLifetimePaid = Object.values(paymentsByLoan).reduce((s, p) => s + p.totalPaid, 0)

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-7xl mx-auto" />

  return (
    <div className="max-w-7xl mx-auto animate-in">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-navy-700">Loan Details</h1>
          <p className="text-gray-500 mt-1">Click any blue cell to edit. Changes save automatically.</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="bg-navy-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-600 transition">
          {showAdd ? 'Cancel' : '+ Add Loan'}
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="metric-card">
          <span className="metric-label">Active Balance</span>
          <span className="metric-value text-red-600">{fmtCurrencyExact(totalBalance)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Monthly Interest</span>
          <span className="metric-value text-orange-600">{fmtCurrencyExact(totalMonthlyInterest)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Active / Total Loans</span>
          <span className="metric-value text-navy-700">{activeLoans.length} / {loans.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Lifetime Payments</span>
          <span className="metric-value text-green-600">{fmtCurrencyExact(totalLifetimePaid)}</span>
        </div>
      </div>

      {/* Add loan form */}
      {showAdd && (
        <div className="card mb-6 p-6 bg-blue-50 border-blue-200 animate-in">
          <h3 className="text-sm font-semibold text-navy-700 mb-4">Add New Loan</h3>
          <div className="grid grid-cols-5 gap-4">
            <input placeholder="Loan ID (e.g. 1-20)" value={newLoan.loan_id}
              onChange={e => setNewLoan({ ...newLoan, loan_id: e.target.value })} className="input-cell text-left" />
            <select value={newLoan.loan_type} onChange={e => setNewLoan({ ...newLoan, loan_type: e.target.value })} className="input-cell text-left">
              <option>Subsidized</option><option>Unsubsidized</option><option>Grad PLUS</option>
            </select>
            <input placeholder="Balance" type="number" step="0.01" value={newLoan.current_balance}
              onChange={e => setNewLoan({ ...newLoan, current_balance: e.target.value })} className="input-cell" />
            <input placeholder="Rate %" type="number" step="0.001" value={newLoan.interest_rate}
              onChange={e => setNewLoan({ ...newLoan, interest_rate: e.target.value })} className="input-cell" />
            <button onClick={addLoan} className="bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition">Add Loan</button>
          </div>
        </div>
      )}

      {/* Active Loans table */}
      <div className="card overflow-x-auto mb-6">
        <div className="card-header"><h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Active Loans ({activeLoans.length})</h2></div>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Loan ID</th><th>Type</th><th className="text-right">Balance</th>
              <th className="text-right">Rate</th><th className="text-right">Mo. Interest</th>
              <th className="text-right">Total Paid</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {activeLoans.map((loan, i) => (
              <LoanRow key={loan.id} loan={loan} index={i} saving={saving === loan.id}
                onUpdate={updateLoan} onDelete={deleteLoan} stats={paymentsByLoan[loan.loan_id]} />
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-navy-700 text-white font-semibold">
              <td colSpan={3} className="px-4 py-3">TOTALS</td>
              <td className="px-4 py-3 text-right">{fmtCurrencyExact(totalBalance)}</td>
              <td className="px-4 py-3 text-right">
                {fmtPct(totalBalance > 0 ? activeLoans.reduce((s, l) => s + Number(l.current_balance) * Number(l.interest_rate), 0) / totalBalance : 0)} avg
              </td>
              <td className="px-4 py-3 text-right">{fmtCurrencyExact(totalMonthlyInterest)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Paid Off Loans */}
      {paidOffLoans.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="card-header flex justify-between items-center cursor-pointer" onClick={() => setShowPaidOff(!showPaidOff)}>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Paid Off Loans ({paidOffLoans.length})
            </h2>
            <span className="text-xs text-gray-500">{showPaidOff ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showPaidOff && (
            <table className="data-table">
              <thead>
                <tr><th>Loan ID</th><th>Type</th><th className="text-right">Original Balance</th><th className="text-right">Total Paid</th><th className="text-right">Interest Paid</th><th>Status</th></tr>
              </thead>
              <tbody>
                {paidOffLoans.map(loan => {
                  const stats = paymentsByLoan[loan.loan_id] || {}
                  return (
                    <tr key={loan.id} className="bg-green-50">
                      <td className="font-semibold text-green-700">{loan.loan_id}</td>
                      <td>{loan.loan_type}</td>
                      <td className="text-right">{fmtCurrencyExact(loan.original_balance)}</td>
                      <td className="text-right font-medium">{fmtCurrencyExact(stats.totalPaid || 0)}</td>
                      <td className="text-right text-red-600">{fmtCurrencyExact(stats.interestPaid || 0)}</td>
                      <td><span className="badge-paid">Paid Off</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function LoanRow({ loan, index, saving, onUpdate, onDelete, stats }) {
  const [editField, setEditField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const monthlyInterest = Number(loan.current_balance) * Number(loan.interest_rate) / 100 / 12

  function startEdit(field, value) { setEditField(field); setEditValue(value) }
  function commitEdit(field) {
    if (editValue !== '') onUpdate(loan.id, field, Number(editValue))
    setEditField(null)
  }

  return (
    <tr className={`${saving ? 'opacity-50' : ''}`}>
      <td>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
          {index + 1}
        </span>
      </td>
      <td className="font-semibold text-navy-700">{loan.loan_id}</td>
      <td>
        <select value={loan.loan_type} onChange={e => onUpdate(loan.id, 'loan_type', e.target.value)}
          className="text-sm bg-transparent border-0 cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5">
          <option>Subsidized</option><option>Unsubsidized</option><option>Grad PLUS</option>
        </select>
      </td>
      <td className="text-right">
        {editField === 'current_balance' ? (
          <input type="number" step="0.01" value={editValue} autoFocus
            onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit('current_balance')}
            onKeyDown={e => e.key === 'Enter' && commitEdit('current_balance')} className="input-cell w-32" />
        ) : (
          <span onClick={() => startEdit('current_balance', loan.current_balance)}
            className="cursor-pointer text-blue-700 font-semibold hover:bg-yellow-100 px-2 py-1 rounded transition">
            {fmtCurrencyExact(loan.current_balance)}
          </span>
        )}
      </td>
      <td className="text-right">
        {editField === 'interest_rate' ? (
          <input type="number" step="0.001" value={editValue} autoFocus
            onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit('interest_rate')}
            onKeyDown={e => e.key === 'Enter' && commitEdit('interest_rate')} className="input-cell w-24" />
        ) : (
          <span onClick={() => startEdit('interest_rate', loan.interest_rate)}
            className="cursor-pointer text-blue-700 font-semibold hover:bg-yellow-100 px-2 py-1 rounded transition">
            {fmtPct(loan.interest_rate, 3)}
          </span>
        )}
      </td>
      <td className="text-right text-gray-600">{fmtCurrencyExact(monthlyInterest)}</td>
      <td className="text-right text-sm text-gray-500">{stats ? fmtCurrencyExact(stats.totalPaid) : '—'}</td>
      <td><span className="badge-active">Active</span></td>
      <td>
        <button onClick={() => onDelete(loan.id)} className="text-gray-400 hover:text-red-600 text-sm transition" title="Delete">&#10005;</button>
      </td>
    </tr>
  )
}
