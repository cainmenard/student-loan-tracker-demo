'use client'
import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell
} from 'recharts'
import { fmtCurrency, fmtDate } from '@/lib/utils'

export default function ProgressChart({ monthlyData }) {
  const [view, setView] = useState('balance')

  if (!monthlyData || monthlyData.length === 0) return null

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Payment History</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'balance', label: 'Balance Over Time' },
            { key: 'payments', label: 'Monthly Payments' },
            { key: 'cumulative', label: 'Cumulative Paid' },
          ].map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition
                ${view === t.key ? 'bg-white shadow text-navy-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {view === 'balance' && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} />
              <Area type="monotone" dataKey="balance" stroke="#E74C3C" fill="#E74C3C"
                fillOpacity={0.12} strokeWidth={2} name="Remaining Balance" />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {view === 'payments' && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={monthlyData.filter(d => d.paid > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} />
              <Bar dataKey="principalPaid" stackId="a" fill="#27AE60" name="Principal" />
              <Bar dataKey="interestPaid" stackId="a" fill="#E74C3C" name="Interest" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        )}

        {view === 'cumulative' && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} />
              <Area type="monotone" dataKey="cumPrincipal" stroke="#27AE60" fill="#27AE60"
                fillOpacity={0.15} strokeWidth={2} name="Cumulative Principal" />
              <Area type="monotone" dataKey="cumInterest" stroke="#E74C3C" fill="#E74C3C"
                fillOpacity={0.15} strokeWidth={2} name="Cumulative Interest" />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
