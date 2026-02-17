'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'
import { fmtCurrency } from '@/lib/utils'

const COLORS = ['#94a3b8', '#4A90D9', '#27AE60', '#F39C12', '#E74C3C', '#9B59B6']

export default function ScenarioChart({ scenarios }) {
  const data = scenarios.map((s, i) => ({
    name: s.label,
    months: s.months,
    interest: s.totalInterest,
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Visual Comparison</h2>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs text-gray-500 font-semibold uppercase mb-3">Months to Payoff</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `${v} months`} />
              <Bar dataKey="months" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="text-xs text-gray-500 font-semibold uppercase mb-3">Total Interest Paid</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} />
              <Bar dataKey="interest" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
