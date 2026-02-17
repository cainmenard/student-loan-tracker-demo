'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrencyExact, fmtCurrency } from '@/lib/utils'

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [loans, setLoans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filterLoan, setFilterLoan] = useState('ALL')
  const [filterYear, setFilterYear] = useState('ALL')
  const [showCount, setShowCount] = useState(50)
  const [newPayment, setNewPayment] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    loan_id: '', amount: '', principal: '', interest: '', new_balance: '', notes: '',
  })

  const load = useCallback(async () => {
    const [pRes, lRes] = await Promise.all([
      supabase.from('payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('loans').select('loan_id, loan_type, current_balance, status').order('avalanche_priority'),
    ])
    setPayments(pRes.data || [])
    setLoans(lRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addPayment() {
    if (!newPayment.loan_id || !newPayment.amount) return
    await supabase.from('payments').insert({
      ...newPayment, amount: Number(newPayment.amount),
      principal: Number(newPayment.principal) || 0, interest: Number(newPayment.interest) || 0,
      new_balance: Number(newPayment.new_balance) || 0,
    })
    if (newPayment.new_balance) {
      await supabase.from('loans').update({ current_balance: Number(newPayment.new_balance) }).eq('loan_id', newPayment.loan_id)
    }
    setNewPayment({ payment_date: new Date().toISOString().slice(0, 10), loan_id: '', amount: '', principal: '', interest: '', new_balance: '', notes: '' })
    setShowAdd(false)
    await load()
  }

  async function deletePayment(id) {
    if (!confirm('Delete this payment record?')) return
    await supabase.from('payments').delete().eq('id', id)
    await load()
  }

  // Filter logic
  const years = useMemo(() => {
    const yrs = new Set(payments.map(p => new Date(p.payment_date + 'T00:00:00').getFullYear()))
    return Array.from(yrs).sort((a, b) => b - a)
  }, [payments])

  const loanIds = useMemo(() => {
    return Array.from(new Set(payments.map(p => p.loan_id))).sort()
  }, [payments])

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (filterLoan !== 'ALL' && p.loan_id !== filterLoan) return false
      if (filterYear !== 'ALL' && new Date(p.payment_date + 'T00:00:00').getFullYear() !== Number(filterYear)) return false
      return true
    })
  }, [payments, filterLoan, filterYear])

  const displayedPayments = filteredPayments.slice(0, showCount)

  // Stats for filtered view
  const stats = useMemo(() => ({
    count: filteredPayments.length,
    totalPaid: filteredPayments.reduce((s, p) => s + Number(p.amount), 0),
    totalPrincipal: filteredPayments.reduce((s, p) => s + Number(p.principal), 0),
    totalInterest: filteredPayments.reduce((s, p) => s + Number(p.interest), 0),
  }), [filteredPayments])

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-7xl mx-auto" />

  return (
    <div className="max-w-7xl mx-auto animate-in">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-navy-700">Payment Log</h1>
          <p className="text-gray-500 mt-1">{payments.length} total payment records from aidvantage history</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="bg-navy-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-navy-600 transition">
          {showAdd ? 'Cancel' : '+ Log Payment'}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="metric-card">
          <span className="metric-label">{filterLoan === 'ALL' && filterYear === 'ALL' ? 'Lifetime' : 'Filtered'} Payments</span>
          <span className="metric-value text-navy-700">{stats.count}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Paid</span>
          <span className="metric-value text-green-600">{fmtCurrency(stats.totalPaid)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">To Principal</span>
          <span className="metric-value text-navy-700">{fmtCurrency(stats.totalPrincipal)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">To Interest</span>
          <span className="metric-value text-orange-600">{fmtCurrency(stats.totalInterest)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-gray-600">Filter:</span>
        <select value={filterLoan} onChange={e => { setFilterLoan(e.target.value); setShowCount(50) }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500">
          <option value="ALL">All Loans</option>
          {loanIds.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setShowCount(50) }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500">
          <option value="ALL">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(filterLoan !== 'ALL' || filterYear !== 'ALL') && (
          <button onClick={() => { setFilterLoan('ALL'); setFilterYear('ALL') }}
            className="text-xs text-red-600 hover:underline">Clear Filters</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          Showing {Math.min(showCount, filteredPayments.length)} of {filteredPayments.length}
        </span>
      </div>

      {/* Add payment form */}
      {showAdd && (
        <div className="card mb-6 p-6 bg-blue-50 border-blue-200 animate-in">
          <h3 className="text-sm font-semibold text-navy-700 mb-4">Log New Payment</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">Date</label>
              <input type="date" value={newPayment.payment_date}
                onChange={e => setNewPayment({ ...newPayment, payment_date: e.target.value })} className="input-cell w-full text-left" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">Loan</label>
              <select value={newPayment.loan_id} onChange={e => setNewPayment({ ...newPayment, loan_id: e.target.value })} className="input-cell w-full text-left">
                <option value="">Select loan...</option>
                {loans.filter(l => l.status === 'Active').map(l => (
                  <option key={l.loan_id} value={l.loan_id}>{l.loan_id} — {l.loan_type} ({fmtCurrencyExact(l.current_balance)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">Total Amount</label>
              <input type="number" step="0.01" placeholder="$0.00" value={newPayment.amount}
                onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })} className="input-cell w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">New Balance</label>
              <input type="number" step="0.01" placeholder="auto-updates loan" value={newPayment.new_balance}
                onChange={e => setNewPayment({ ...newPayment, new_balance: e.target.value })} className="input-cell w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">To Principal</label>
              <input type="number" step="0.01" value={newPayment.principal}
                onChange={e => setNewPayment({ ...newPayment, principal: e.target.value })} className="input-cell w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1 font-medium">To Interest</label>
              <input type="number" step="0.01" value={newPayment.interest}
                onChange={e => setNewPayment({ ...newPayment, interest: e.target.value })} className="input-cell w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-1 font-medium">Notes</label>
              <input type="text" placeholder="Optional" value={newPayment.notes}
                onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })} className="input-cell w-full text-left" />
            </div>
          </div>
          <button onClick={addPayment} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition">
            Save Payment
          </button>
        </div>
      )}

      {/* Payments table */}
      <div className="card overflow-x-auto">
        {displayedPayments.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Loan</th><th className="text-right">Amount</th><th className="text-right">Principal</th>
                  <th className="text-right">Interest</th><th className="text-right">Balance After</th><th></th></tr>
              </thead>
              <tbody>
                {displayedPayments.map(p => (
                  <tr key={p.id}>
                    <td>{new Date(p.payment_date + 'T00:00:00').toLocaleDateString()}</td>
                    <td className="font-semibold text-navy-700">{p.loan_id}</td>
                    <td className="text-right font-semibold text-green-700">{fmtCurrencyExact(p.amount)}</td>
                    <td className="text-right">{Number(p.principal) > 0 ? fmtCurrencyExact(p.principal) : '—'}</td>
                    <td className="text-right text-red-600">{Number(p.interest) > 0 ? fmtCurrencyExact(p.interest) : '—'}</td>
                    <td className="text-right">{Number(p.new_balance) >= 0 ? fmtCurrencyExact(p.new_balance) : '—'}</td>
                    <td><button onClick={() => deletePayment(p.id)} className="text-gray-400 hover:text-red-600 text-sm transition">&#10005;</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredPayments.length > showCount && (
              <div className="p-4 text-center">
                <button onClick={() => setShowCount(s => s + 50)}
                  className="text-sm text-blue-600 hover:underline font-medium">
                  Show more ({filteredPayments.length - showCount} remaining)
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 text-center text-gray-400">
            <p className="text-lg mb-2">No payments match your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}
