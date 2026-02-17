'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrencyExact, fmtCurrency, fmtPct, computeScenarioSummary } from '@/lib/utils'

export default function AdvisorPage() {
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [logStatus, setLogStatus] = useState('')
  const [lastPaymentDate, setLastPaymentDate] = useState(null)

  const loadData = useCallback(async () => {
    const [lRes, pRes] = await Promise.all([
      supabase.from('loans').select('*').eq('status', 'Active').order('avalanche_priority'),
      supabase.from('payments').select('payment_date').order('payment_date', { ascending: false }).limit(1),
    ])
    setLoans(lRes.data || [])
    if (pRes.data?.[0]) setLastPaymentDate(pRes.data[0].payment_date)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Core calculations
  const loanData = useMemo(() => {
    return loans
      .filter(l => Number(l.current_balance) > 0)
      .map(l => ({
        ...l,
        balance: Number(l.current_balance),
        rate: Number(l.interest_rate),
        monthlyInterest: Number(l.current_balance) * Number(l.interest_rate) / 100 / 12,
        dailyInterest: Number(l.current_balance) * Number(l.interest_rate) / 100 / 365,
      }))
      .sort((a, b) => b.rate - a.rate) // Avalanche: highest rate first
  }, [loans])

  const totalBalance = useMemo(() => loanData.reduce((s, l) => s + l.balance, 0), [loanData])
  const totalMonthlyInterest = useMemo(() => loanData.reduce((s, l) => s + l.monthlyInterest, 0), [loanData])
  const totalDailyInterest = useMemo(() => loanData.reduce((s, l) => s + l.dailyInterest, 0), [loanData])

  // Days since last payment
  const daysSincePayment = useMemo(() => {
    if (!lastPaymentDate) return null
    const last = new Date(lastPaymentDate + 'T00:00:00')
    const now = new Date()
    return Math.floor((now - last) / (1000 * 60 * 60 * 24))
  }, [lastPaymentDate])

  const interestSinceLastPayment = daysSincePayment != null ? totalDailyInterest * daysSincePayment : null

  // Payment allocation engine
  const allocation = useMemo(() => {
    const amount = Number(paymentAmount) || 0
    if (amount <= 0 || loanData.length === 0) return null

    // Step 1: Calculate interest due on each loan
    const alloc = loanData.map(l => ({
      loan_id: l.loan_id,
      loan_type: l.loan_type,
      rate: l.rate,
      currentBalance: l.balance,
      interestDue: l.monthlyInterest,
      principalPayment: 0,
      totalPayment: 0,
      newBalance: l.balance,
      isPaidOff: false,
    }))

    let remaining = amount

    // Step 2: Cover interest on all loans first (proportional if not enough)
    const totalInterest = alloc.reduce((s, a) => s + a.interestDue, 0)
    if (remaining >= totalInterest) {
      // Enough to cover all interest
      alloc.forEach(a => {
        a.totalPayment += a.interestDue
        remaining -= a.interestDue
      })
    } else {
      // Not enough — allocate proportionally
      alloc.forEach(a => {
        const share = totalInterest > 0 ? (a.interestDue / totalInterest) * remaining : 0
        a.interestDue = share
        a.totalPayment += share
      })
      remaining = 0
    }

    // Step 3: Allocate remaining to principal in avalanche order (highest rate first)
    // loanData is already sorted by rate descending
    for (const a of alloc) {
      if (remaining <= 0) break
      const maxPrincipal = a.currentBalance
      const principalPay = Math.min(remaining, maxPrincipal)
      a.principalPayment = principalPay
      a.totalPayment += principalPay
      a.newBalance = Math.max(0, a.currentBalance - principalPay)
      a.isPaidOff = a.newBalance < 0.01
      remaining -= principalPay
    }

    // Round everything
    alloc.forEach(a => {
      a.interestDue = Math.round(a.interestDue * 100) / 100
      a.principalPayment = Math.round(a.principalPayment * 100) / 100
      a.totalPayment = Math.round(a.totalPayment * 100) / 100
      a.newBalance = Math.round(a.newBalance * 100) / 100
    })

    const totalPrincipal = alloc.reduce((s, a) => s + a.principalPayment, 0)
    const totalInterestPaid = alloc.reduce((s, a) => s + a.interestDue, 0)
    const loansPayedOff = alloc.filter(a => a.isPaidOff)
    const newTotalBalance = alloc.reduce((s, a) => s + a.newBalance, 0)
    const leftover = Math.round(remaining * 100) / 100

    return {
      allocations: alloc.filter(a => a.totalPayment > 0.005),
      totalPrincipal: Math.round(totalPrincipal * 100) / 100,
      totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
      loansPayedOff,
      newTotalBalance: Math.round(newTotalBalance * 100) / 100,
      leftover,
    }
  }, [paymentAmount, loanData])

  // Impact comparison: what if you just paid minimum vs this amount
  const impact = useMemo(() => {
    if (!allocation || loanData.length === 0) return null
    const amount = Number(paymentAmount) || 0
    const minOnly = computeScenarioSummary(loanData, totalMonthlyInterest + 50) // bare minimum + tiny extra
    const withThis = computeScenarioSummary(loanData, amount)
    return {
      minMonths: minOnly.months,
      minInterest: minOnly.totalInterest,
      thisMonths: withThis.months,
      thisInterest: withThis.totalInterest,
      monthsSaved: minOnly.months - withThis.months,
      interestSaved: minOnly.totalInterest - withThis.totalInterest,
    }
  }, [allocation, loanData, paymentAmount, totalMonthlyInterest])

  // Log all payments to Supabase
  async function logPayments() {
    if (!allocation) return
    setLogStatus('Saving...')
    const today = new Date().toISOString().slice(0, 10)
    const inserts = allocation.allocations.map(a => ({
      payment_date: today,
      loan_id: a.loan_id,
      amount: a.totalPayment,
      principal: a.principalPayment,
      interest: a.interestDue,
      new_balance: a.newBalance,
      notes: 'Payment Advisor allocation',
    }))

    const { error: insertError } = await supabase.from('payments').insert(inserts)
    if (insertError) {
      setLogStatus('Error saving payments')
      return
    }

    // Update loan balances
    for (const a of allocation.allocations) {
      await supabase.from('loans')
        .update({
          current_balance: a.newBalance,
          status: a.isPaidOff ? 'Paid Off' : 'Active',
        })
        .eq('loan_id', a.loan_id)
    }

    setLogStatus('Saved!')
    setPaymentAmount('')
    await loadData()
    setTimeout(() => setLogStatus(''), 3000)
  }

  // Quick amount presets
  const presets = [500, 1000, 1500, 2000, 3000, 5000]

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-5xl mx-auto" />

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-700">Payment Advisor</h1>
        <p className="text-gray-500 mt-1">Enter an amount and get the optimal avalanche allocation across your loans.</p>
      </div>

      {/* Interest ticker */}
      <div className="card mb-6 p-5 bg-gradient-to-r from-red-50 to-orange-50 border-red-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Daily Interest Accruing</p>
            <p className="text-2xl font-bold text-red-700">{fmtCurrencyExact(totalDailyInterest)}</p>
          </div>
          <div>
            <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider">Monthly Interest</p>
            <p className="text-2xl font-bold text-orange-700">{fmtCurrencyExact(totalMonthlyInterest)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">Days Since Last Payment</p>
            <p className="text-2xl font-bold text-gray-800">{daysSincePayment ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Interest Since Last Pmt</p>
            <p className="text-2xl font-bold text-red-700">
              {interestSinceLastPayment != null ? fmtCurrencyExact(interestSinceLastPayment) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Payment input */}
      <div className="card mb-8 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">How much can you pay?</h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-gray-400 font-bold">$</span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              className="w-full text-4xl font-bold text-navy-700 pl-12 pr-4 py-4 border-2 border-blue-300 rounded-xl
                bg-yellow-50 focus:outline-none focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button key={p} onClick={() => setPaymentAmount(String(p))}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all
                ${Number(paymentAmount) === p
                  ? 'bg-navy-700 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {fmtCurrency(p)}
            </button>
          ))}
          <button onClick={() => setPaymentAmount(String(Math.round(totalMonthlyInterest + 1)))}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition-all">
            Interest Only ({fmtCurrency(totalMonthlyInterest)})
          </button>
        </div>
        {Number(paymentAmount) > 0 && Number(paymentAmount) < totalMonthlyInterest && (
          <p className="mt-3 text-sm text-red-600 font-medium">
            This is less than the {fmtCurrencyExact(totalMonthlyInterest)} monthly interest — your balance will grow.
          </p>
        )}
      </div>

      {/* Allocation results */}
      {allocation && (
        <div className="animate-in">
          {/* Action plan header */}
          <div className="card mb-6 overflow-hidden">
            <div className="p-5 bg-navy-700 text-white">
              <h2 className="text-lg font-bold mb-1">Your Payment Plan</h2>
              <p className="text-blue-200 text-sm">
                {fmtCurrency(Number(paymentAmount))} allocated across {allocation.allocations.length} loan{allocation.allocations.length !== 1 ? 's' : ''} using Avalanche method
              </p>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 bg-gray-50">
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500 font-medium uppercase">To Principal</p>
                <p className="text-xl font-bold text-green-700">{fmtCurrency(allocation.totalPrincipal)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500 font-medium uppercase">To Interest</p>
                <p className="text-xl font-bold text-red-600">{fmtCurrency(allocation.totalInterestPaid)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500 font-medium uppercase">New Balance</p>
                <p className="text-xl font-bold text-navy-700">{fmtCurrency(allocation.newTotalBalance)}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs text-gray-500 font-medium uppercase">Loans Cleared</p>
                <p className="text-xl font-bold text-green-600">{allocation.loansPayedOff.length}</p>
              </div>
            </div>

            {/* Per-loan allocation table */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loan</th>
                  <th>Type</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Current Balance</th>
                  <th className="text-right">Interest</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right font-bold">Send This</th>
                  <th className="text-right">New Balance</th>
                </tr>
              </thead>
              <tbody>
                {allocation.allocations.map(a => (
                  <tr key={a.loan_id} className={a.isPaidOff ? 'bg-green-50' : a.principalPayment > 0 ? 'bg-blue-50' : ''}>
                    <td className="font-semibold text-navy-700">
                      {a.loan_id}
                      {a.isPaidOff && <span className="ml-2 text-green-600 text-xs font-bold">PAID OFF!</span>}
                    </td>
                    <td className="text-sm">{a.loan_type}</td>
                    <td className="text-right text-sm">{fmtPct(a.rate)}</td>
                    <td className="text-right text-sm">{fmtCurrencyExact(a.currentBalance)}</td>
                    <td className="text-right text-red-600 text-sm">{fmtCurrencyExact(a.interestDue)}</td>
                    <td className="text-right text-green-700 text-sm font-medium">
                      {a.principalPayment > 0 ? fmtCurrencyExact(a.principalPayment) : '—'}
                    </td>
                    <td className="text-right font-bold text-navy-700 text-lg">
                      {fmtCurrencyExact(a.totalPayment)}
                    </td>
                    <td className="text-right">
                      {a.isPaidOff
                        ? <span className="text-green-600 font-bold">$0.00</span>
                        : fmtCurrencyExact(a.newBalance)
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {allocation.leftover > 0.01 && (
              <div className="p-3 bg-yellow-50 text-yellow-800 text-sm text-center">
                {fmtCurrencyExact(allocation.leftover)} left over after paying off all loans. You did it!
              </div>
            )}
          </div>

          {/* Loans getting paid off */}
          {allocation.loansPayedOff.length > 0 && (
            <div className="card mb-6 p-5 bg-green-50 border-green-200">
              <h3 className="text-sm font-bold text-green-800 uppercase tracking-wider mb-2">
                Loans Eliminated With This Payment
              </h3>
              <div className="flex flex-wrap gap-3">
                {allocation.loansPayedOff.map(a => (
                  <div key={a.loan_id} className="bg-white border border-green-300 rounded-lg px-4 py-2 flex items-center gap-2">
                    <span className="text-green-600 text-lg">&#10003;</span>
                    <div>
                      <span className="font-bold text-green-800">{a.loan_id}</span>
                      <span className="text-xs text-green-600 ml-2">{a.loan_type} at {fmtPct(a.rate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact comparison */}
          {impact && impact.thisMonths > 0 && (
            <div className="card mb-6 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                If You Pay {fmtCurrency(Number(paymentAmount))}/mo Going Forward
              </h3>
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold text-navy-700">{impact.thisMonths}</p>
                  <p className="text-xs text-gray-500 uppercase font-medium mt-1">Months to Payoff</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-orange-600">{fmtCurrency(impact.thisInterest)}</p>
                  <p className="text-xs text-gray-500 uppercase font-medium mt-1">Total Interest</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{fmtCurrency(impact.interestSaved)}</p>
                  <p className="text-xs text-gray-500 uppercase font-medium mt-1">Interest Saved vs Minimum</p>
                  {impact.monthsSaved > 0 && (
                    <p className="text-xs text-green-600 mt-1">{impact.monthsSaved} fewer months</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Log payment button */}
          <div className="card p-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Ready to execute this plan?</h3>
              <p className="text-sm text-gray-500">
                This will log {allocation.allocations.length} payment records and update all loan balances.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {logStatus && (
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                  logStatus === 'Saving...' ? 'bg-yellow-100 text-yellow-700'
                    : logStatus === 'Saved!' ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>{logStatus}</span>
              )}
              <button onClick={logPayments}
                className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-green-700 transition-all
                  shadow-lg shadow-green-600/20 active:scale-95">
                Log Payments &amp; Update Balances
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How it works (shown when no amount entered) */}
      {!allocation && (
        <div className="card p-6">
          <h3 className="font-semibold text-gray-800 mb-3">How the Avalanche Method Works</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <span className="font-semibold text-navy-700">Step 1:</span> Your payment covers accrued interest on every loan first, so none of them fall behind.
            </p>
            <p>
              <span className="font-semibold text-navy-700">Step 2:</span> Every remaining dollar goes to the loan with the <span className="font-semibold">highest interest rate</span> — currently <span className="font-bold text-red-600">{loanData[0]?.loan_id}</span> at {fmtPct(loanData[0]?.rate)}. This minimizes total interest paid over the life of your loans.
            </p>
            <p>
              <span className="font-semibold text-navy-700">Step 3:</span> Once that loan is paid off, the next highest rate loan gets the extra. The snowball effect accelerates as each loan is eliminated.
            </p>
          </div>

          {/* Current priority order */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Current Avalanche Priority</p>
            <div className="flex flex-wrap gap-2">
              {loanData.map((l, i) => (
                <div key={l.loan_id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                    ${i === 0 ? 'bg-red-100 text-red-800 font-bold' : 'bg-gray-100 text-gray-700'}`}>
                  <span className="text-xs font-bold">{i + 1}.</span>
                  {l.loan_id}
                  <span className="text-xs opacity-70">{fmtPct(l.rate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
