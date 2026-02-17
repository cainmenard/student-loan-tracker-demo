'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtCurrencyExact, fmtCurrency, fmtPct } from '@/lib/utils'
import Link from 'next/link'

// CSV parser that handles the aidvantage format quirks
function parseAidvantageCSV(text) {
  // Strip HTML doctype if present
  text = text.replace(/<!DOCTYPE[^>]*>/gi, '').trim()
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i])
    if (parts.length < 8) continue

    const date = parts[0].trim()
    const loanName = parts[1].trim()
    const description = parts[2].trim()
    const principal = parseMoney(parts[3])
    const interest = parseMoney(parts[4])
    const fees = parseMoney(parts[5])
    const total = parseMoney(parts[6])
    const balance = parseMoney(parts[7])

    if (!date || !loanName) continue

    // Extract loan ID from name (e.g. "1-17 Direct Grad PLUS" -> "1-17")
    const loanId = loanName.split(' ')[0]

    // Determine loan type
    let loanType = 'Subsidized'
    if (loanName.includes('Grad PLUS')) loanType = 'Grad PLUS'
    else if (loanName.includes('Unsubsidized')) loanType = 'Unsubsidized'

    // Parse date MM/DD/YYYY -> YYYY-MM-DD
    const dp = date.split('/')
    const isoDate = dp.length === 3 ? `${dp[2]}-${dp[0].padStart(2, '0')}-${dp[1].padStart(2, '0')}` : date

    rows.push({
      date: isoDate,
      loanId,
      loanName,
      loanType,
      description,
      principal: Math.abs(principal),
      interest: Math.abs(interest),
      fees: Math.abs(fees),
      total: Math.abs(total),
      balance: balance != null ? balance : 0,
      rawTotal: total,
    })
  }

  return rows
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}

function parseMoney(s) {
  if (!s) return 0
  s = s.trim().replace(/[$",]/g, '')
  if (!s || s === 'Unavailable') return null
  return parseFloat(s) || 0
}

export default function ImportPage() {
  const [dbLoans, setDbLoans] = useState([])
  const [dbPayments, setDbPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [csvData, setCsvData] = useState(null)
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const loadData = useCallback(async () => {
    const [lRes, pRes] = await Promise.all([
      supabase.from('loans').select('*'),
      supabase.from('payments').select('payment_date, loan_id, amount, principal, interest'),
    ])
    setDbLoans(lRes.data || [])
    setDbPayments(pRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setSyncResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const parsed = parseAidvantageCSV(text)
      setCsvData(parsed)
    }
    reader.readAsText(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) handleFile(file)
  }

  function handleFileInput(e) {
    handleFile(e.target.files[0])
  }

  // Build a fingerprint for dedup: date + loan_id + amount
  function paymentKey(date, loanId, amount) {
    return `${date}|${loanId}|${Number(amount).toFixed(2)}`
  }

  // Analyze CSV vs database
  const analysis = useMemo(() => {
    if (!csvData || csvData.length === 0) return null

    // Existing payment fingerprints
    const existingKeys = new Set(
      dbPayments.map(p => paymentKey(p.payment_date, p.loan_id, p.amount))
    )

    // Current balances from CSV (most recent transaction per loan)
    const currentBalances = {}
    const loanTypes = {}
    csvData.forEach(row => {
      if (!currentBalances[row.loanId]) {
        currentBalances[row.loanId] = row.balance
        loanTypes[row.loanId] = row.loanType
      }
    })

    // Current balances from DB
    const dbBalances = {}
    dbLoans.forEach(l => { dbBalances[l.loan_id] = Number(l.current_balance) })

    // Balance changes
    const balanceChanges = []
    Object.entries(currentBalances).forEach(([loanId, csvBalance]) => {
      const dbBalance = dbBalances[loanId]
      if (dbBalance === undefined) {
        // New loan not in DB
        balanceChanges.push({ loanId, loanType: loanTypes[loanId], oldBalance: null, newBalance: csvBalance, isNew: true })
      } else if (Math.abs(dbBalance - csvBalance) > 0.005) {
        balanceChanges.push({ loanId, loanType: loanTypes[loanId], oldBalance: dbBalance, newBalance: csvBalance, isNew: false })
      }
    })

    // New payment transactions
    const newPayments = csvData
      .filter(row => row.description === 'PAYMENT' && row.total > 0)
      .filter(row => !existingKeys.has(paymentKey(row.date, row.loanId, row.total)))
      .map(row => ({
        payment_date: row.date,
        loan_id: row.loanId,
        amount: row.total,
        principal: row.principal,
        interest: row.interest,
        new_balance: row.balance,
        notes: 'CSV Import',
      }))

    // Summary stats from CSV
    const allPayments = csvData.filter(r => r.description === 'PAYMENT' && r.total > 0)
    const totalPaidCSV = allPayments.reduce((s, r) => s + r.total, 0)
    const activeLoans = Object.entries(currentBalances).filter(([_, b]) => b > 0)
    const paidOffLoans = Object.entries(currentBalances).filter(([_, b]) => b === 0)
    const totalCurrentBalance = activeLoans.reduce((s, [_, b]) => s + b, 0)

    return {
      balanceChanges,
      newPayments,
      totalTransactions: csvData.length,
      totalPaymentsInCSV: allPayments.length,
      totalPaidCSV,
      activeLoans: activeLoans.length,
      paidOffLoans: paidOffLoans.length,
      totalCurrentBalance,
      currentBalances,
      loanTypes,
      alreadyImported: allPayments.length - newPayments.length,
    }
  }, [csvData, dbLoans, dbPayments])

  // Execute sync
  async function executeSync() {
    if (!analysis) return
    setSyncing(true)
    let balancesUpdated = 0
    let loansCreated = 0
    let paymentsInserted = 0

    try {
      // 1. Update balances + create new loans
      for (const change of analysis.balanceChanges) {
        if (change.isNew) {
          // Insert new loan
          const maxPriority = Math.max(0, ...dbLoans.map(l => l.avalanche_priority || 0))
          await supabase.from('loans').insert({
            loan_id: change.loanId,
            loan_type: change.loanType,
            current_balance: change.newBalance,
            original_balance: change.newBalance,
            interest_rate: 0, // Will need manual entry
            status: change.newBalance > 0 ? 'Active' : 'Paid Off',
            avalanche_priority: maxPriority + 1,
            snowball_priority: maxPriority + 1,
          })
          loansCreated++
        } else {
          // Update existing loan balance
          const updateData = { current_balance: change.newBalance }
          if (change.newBalance <= 0) updateData.status = 'Paid Off'
          else updateData.status = 'Active'
          await supabase.from('loans').update(updateData).eq('loan_id', change.loanId)
          balancesUpdated++
        }
      }

      // 2. Insert new payments in batches
      if (analysis.newPayments.length > 0) {
        const batchSize = 50
        for (let i = 0; i < analysis.newPayments.length; i += batchSize) {
          const batch = analysis.newPayments.slice(i, i + batchSize)
          const { error } = await supabase.from('payments').insert(batch)
          if (error) console.error('Payment insert error:', error)
          else paymentsInserted += batch.length
        }
      }

      setSyncResult({
        success: true,
        balancesUpdated,
        loansCreated,
        paymentsInserted,
      })

      // Reload data
      await loadData()
    } catch (err) {
      console.error('Sync error:', err)
      setSyncResult({ success: false, error: err.message })
    }

    setSyncing(false)
  }

  if (loading) return <div className="skeleton h-96 rounded-xl max-w-5xl mx-auto" />

  return (
    <div className="max-w-5xl mx-auto animate-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-700">Import from Aidvantage</h1>
        <p className="text-gray-500 mt-1">Upload your AllLoans CSV to sync balances and payment history automatically.</p>
      </div>

      {/* Workflow steps */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className={`card p-4 text-center ${!csvData ? 'ring-2 ring-blue-400' : 'opacity-60'}`}>
          <div className="text-2xl mb-1">1</div>
          <p className="text-sm font-semibold text-navy-700">Upload CSV</p>
          <p className="text-xs text-gray-500">From aidvantage &quot;All Loans&quot;</p>
        </div>
        <div className={`card p-4 text-center ${csvData && !syncResult ? 'ring-2 ring-blue-400' : 'opacity-60'}`}>
          <div className="text-2xl mb-1">2</div>
          <p className="text-sm font-semibold text-navy-700">Review Changes</p>
          <p className="text-xs text-gray-500">Verify what gets updated</p>
        </div>
        <div className={`card p-4 text-center ${syncResult?.success ? 'ring-2 ring-green-400' : 'opacity-60'}`}>
          <div className="text-2xl mb-1">3</div>
          <p className="text-sm font-semibold text-navy-700">Sync &amp; Pay</p>
          <p className="text-xs text-gray-500">Apply updates, then go to Advisor</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`card p-12 text-center cursor-pointer transition-all border-2 border-dashed mb-8
          ${dragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'}`}
        onClick={() => document.getElementById('csv-input').click()}
      >
        <input id="csv-input" type="file" accept=".csv" onChange={handleFileInput} className="hidden" />
        <div className="text-5xl mb-3">&#128196;</div>
        {fileName ? (
          <>
            <p className="text-lg font-semibold text-navy-700">{fileName}</p>
            <p className="text-sm text-gray-500 mt-1">
              {csvData ? `${csvData.length} transactions parsed` : 'Parsing...'}
            </p>
            <button onClick={(e) => { e.stopPropagation(); setCsvData(null); setFileName(''); setSyncResult(null) }}
              className="text-xs text-red-600 hover:underline mt-2">
              Upload a different file
            </button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-gray-700">Drop your AllLoans CSV here</p>
            <p className="text-sm text-gray-400 mt-1">or click to browse</p>
            <p className="text-xs text-gray-400 mt-3">
              Download from aidvantage: Loan Details &rarr; All Loans &rarr; Export to CSV
            </p>
          </>
        )}
      </div>

      {/* Analysis results */}
      {analysis && !syncResult && (
        <div className="animate-in">
          {/* CSV Summary */}
          <div className="card mb-6 p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">CSV Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-navy-700">{analysis.totalTransactions}</p>
                <p className="text-xs text-gray-500">Total Transactions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{analysis.activeLoans}</p>
                <p className="text-xs text-gray-500">Active Loans</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-500">{analysis.paidOffLoans}</p>
                <p className="text-xs text-gray-500">Paid Off</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{fmtCurrency(analysis.totalCurrentBalance)}</p>
                <p className="text-xs text-gray-500">Current Balance</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{fmtCurrency(analysis.totalPaidCSV)}</p>
                <p className="text-xs text-gray-500">Lifetime Paid</p>
              </div>
            </div>
          </div>

          {/* Balance Changes */}
          {analysis.balanceChanges.length > 0 && (
            <div className="card mb-6 overflow-hidden">
              <div className="card-header bg-orange-50">
                <h2 className="text-sm font-semibold text-orange-800 uppercase tracking-wider">
                  Balance Updates ({analysis.balanceChanges.length})
                </h2>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Loan</th><th>Type</th><th className="text-right">DB Balance</th><th className="text-right">CSV Balance</th><th className="text-right">Change</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {analysis.balanceChanges.map(c => {
                    const diff = c.isNew ? c.newBalance : (c.newBalance - c.oldBalance)
                    return (
                      <tr key={c.loanId} className={c.isNew ? 'bg-blue-50' : diff < 0 ? 'bg-green-50' : 'bg-red-50'}>
                        <td className="font-semibold text-navy-700">{c.loanId}</td>
                        <td className="text-sm">{c.loanType}</td>
                        <td className="text-right">{c.isNew ? <span className="text-gray-400">—</span> : fmtCurrencyExact(c.oldBalance)}</td>
                        <td className="text-right font-semibold">{fmtCurrencyExact(c.newBalance)}</td>
                        <td className={`text-right font-semibold ${diff <= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {c.isNew ? '—' : (diff <= 0 ? '' : '+') + fmtCurrencyExact(diff)}
                        </td>
                        <td>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.isNew ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {c.isNew ? 'New Loan' : 'Update'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {analysis.balanceChanges.length === 0 && (
            <div className="card mb-6 p-5 bg-green-50 border-green-200 text-center">
              <p className="text-green-800 font-medium">All loan balances match — no updates needed.</p>
            </div>
          )}

          {/* New Payments */}
          <div className="card mb-6 overflow-hidden">
            <div className="card-header bg-blue-50 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-blue-800 uppercase tracking-wider">
                New Payment Records ({analysis.newPayments.length})
              </h2>
              <span className="text-xs text-gray-500">{analysis.alreadyImported} already in database</span>
            </div>
            {analysis.newPayments.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                <table className="data-table">
                  <thead className="sticky top-0 bg-white">
                    <tr><th>Date</th><th>Loan</th><th className="text-right">Amount</th><th className="text-right">Principal</th><th className="text-right">Interest</th></tr>
                  </thead>
                  <tbody>
                    {analysis.newPayments.slice(0, 100).map((p, i) => (
                      <tr key={i}>
                        <td>{new Date(p.payment_date + 'T00:00:00').toLocaleDateString()}</td>
                        <td className="font-semibold">{p.loan_id}</td>
                        <td className="text-right font-medium">{fmtCurrencyExact(p.amount)}</td>
                        <td className="text-right text-green-700">{fmtCurrencyExact(p.principal)}</td>
                        <td className="text-right text-red-600">{fmtCurrencyExact(p.interest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysis.newPayments.length > 100 && (
                  <p className="text-xs text-gray-400 text-center py-2">Showing first 100 of {analysis.newPayments.length}</p>
                )}
              </div>
            ) : (
              <div className="p-5 text-center text-gray-500 text-sm">All payments already imported.</div>
            )}
          </div>

          {/* Sync button */}
          <div className="card p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Ready to sync?</h3>
              <p className="text-sm text-gray-500">
                This will update {analysis.balanceChanges.length} balance{analysis.balanceChanges.length !== 1 ? 's' : ''}
                {analysis.newPayments.length > 0 ? ` and import ${analysis.newPayments.length} new payment records` : ''}.
              </p>
            </div>
            <button onClick={executeSync} disabled={syncing}
              className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg active:scale-95
                ${syncing ? 'bg-gray-400 cursor-wait' : 'bg-navy-700 text-white hover:bg-navy-600 shadow-navy-700/20'}`}>
              {syncing ? 'Syncing...' : 'Sync to Database'}
            </button>
          </div>
        </div>
      )}

      {/* Sync result */}
      {syncResult && syncResult.success && (
        <div className="animate-in">
          <div className="card mb-6 p-8 bg-green-50 border-green-200 text-center">
            <div className="text-5xl mb-3">&#10003;</div>
            <h2 className="text-xl font-bold text-green-800 mb-2">Sync Complete</h2>
            <div className="text-sm text-green-700 space-y-1">
              {syncResult.balancesUpdated > 0 && <p>{syncResult.balancesUpdated} loan balance{syncResult.balancesUpdated !== 1 ? 's' : ''} updated</p>}
              {syncResult.loansCreated > 0 && <p>{syncResult.loansCreated} new loan{syncResult.loansCreated !== 1 ? 's' : ''} added</p>}
              {syncResult.paymentsInserted > 0 && <p>{syncResult.paymentsInserted} payment record{syncResult.paymentsInserted !== 1 ? 's' : ''} imported</p>}
              {syncResult.balancesUpdated === 0 && syncResult.loansCreated === 0 && syncResult.paymentsInserted === 0 && (
                <p>Everything was already up to date.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Link href="/advisor"
              className="card p-6 text-center hover:ring-2 ring-blue-400 transition-all group">
              <div className="text-3xl mb-2">&#127919;</div>
              <p className="font-bold text-navy-700 group-hover:text-blue-600">Go to Payment Advisor</p>
              <p className="text-sm text-gray-500 mt-1">Calculate your next optimal payment</p>
            </Link>
            <button onClick={() => { setCsvData(null); setFileName(''); setSyncResult(null) }}
              className="card p-6 text-center hover:ring-2 ring-gray-400 transition-all group">
              <div className="text-3xl mb-2">&#128196;</div>
              <p className="font-bold text-gray-700 group-hover:text-gray-900">Import Another CSV</p>
              <p className="text-sm text-gray-500 mt-1">Upload a newer export</p>
            </button>
          </div>
        </div>
      )}

      {syncResult && !syncResult.success && (
        <div className="card p-6 bg-red-50 border-red-200 text-center">
          <p className="text-red-800 font-semibold">Sync failed: {syncResult.error}</p>
          <button onClick={() => setSyncResult(null)} className="text-sm text-red-600 hover:underline mt-2">Try again</button>
        </div>
      )}

      {/* How-to guide */}
      {!csvData && (
        <div className="card p-6 mt-6">
          <h3 className="font-semibold text-gray-800 mb-3">How to export from Aidvantage</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p><span className="font-semibold text-navy-700">1.</span> Log in to <span className="font-medium">aidvantage.com</span></p>
            <p><span className="font-semibold text-navy-700">2.</span> Go to <span className="font-medium">Loan Details</span> &rarr; select <span className="font-medium">&quot;All Loans&quot;</span> from the dropdown</p>
            <p><span className="font-semibold text-navy-700">3.</span> Click the <span className="font-medium">Export</span> or <span className="font-medium">Download</span> button to get the CSV</p>
            <p><span className="font-semibold text-navy-700">4.</span> Upload that file here — we&#39;ll handle the rest</p>
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
            <span className="font-semibold">What gets synced:</span> Current balances on all loans are updated to match the CSV.
            New payment transactions are imported (duplicates are automatically skipped).
            Loans that are paid off get marked accordingly.
          </div>
        </div>
      )}
    </div>
  )
}
