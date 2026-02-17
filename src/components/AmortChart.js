'use client'
import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts'
import { fmtCurrency, fmtDate } from '@/lib/utils'

const COLORS = ['#E74C3C', '#F39C12', '#4A90D9', '#27AE60']

export default function AmortChart({ schedule }) {
  const [chartType, setChartType] = useState('balance')
  const last = schedule[schedule.length - 1]

  // Find where actual ends and projected begins
  const actualEnd = schedule.filter(s => s.isActual).length
  const transitionDate = actualEnd > 0 && actualEnd < schedule.length ? schedule[actualEnd - 1]?.date : null

  // For split rendering: actual balance and projected balance
  const chartData = schedule.map(s => ({
    ...s,
    actualBalance: s.isActual ? s.totalBalance : null,
    projectedBalance: !s.isActual ? s.totalBalance : null,
    dateLabel: fmtDate(s.date),
    // Bridge: last actual point also gets projected value for continuity
  }))

  // Fix bridge between actual and projected
  if (actualEnd > 0 && actualEnd < chartData.length) {
    chartData[actualEnd - 1].projectedBalance = chartData[actualEnd - 1].totalBalance
  }

  const pieData = last ? [
    { name: 'Principal', value: last.cumPrincipal },
    { name: 'Interest', value: last.cumInterest },
  ] : []

  const sampled = schedule.filter((_, i) => i === 0 || i === schedule.length - 1 || i % 3 === 0)

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Payoff Visualization</h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { key: 'balance', label: 'Balance' },
            { key: 'breakdown', label: 'By Type' },
            { key: 'payments', label: 'Payments' },
            { key: 'pie', label: 'Interest Split' },
          ].map(t => (
            <button key={t.key} onClick={() => setChartType(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition
                ${chartType === t.key ? 'bg-white shadow text-navy-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-6">
        {chartType === 'balance' && (
          <>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => v != null ? fmtCurrency(v) : '—'} />
                {transitionDate && <ReferenceLine x={fmtDate(transitionDate)} stroke="#666" strokeDasharray="5 5" label={{ value: 'Now', position: 'top', fontSize: 11 }} />}
                <Area type="monotone" dataKey="actualBalance" stroke="#2563EB" fill="#2563EB"
                  fillOpacity={0.2} strokeWidth={2} name="Actual Balance" connectNulls={false} />
                <Area type="monotone" dataKey="projectedBalance" stroke="#E74C3C" fill="#E74C3C"
                  fillOpacity={0.1} strokeWidth={2} strokeDasharray="6 3" name="Projected" connectNulls={false} />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 text-center mt-2">Solid blue = actual history &middot; Dashed red = projected payoff</p>
          </>
        )}

        {chartType === 'breakdown' && (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={sampled.filter(s => !s.isActual)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tickFormatter={d => fmtDate(d)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} labelFormatter={d => fmtDate(d)} />
              <Area type="monotone" dataKey="gradPlusBal" stackId="1" stroke="#E74C3C" fill="#E74C3C" fillOpacity={0.7} name="Grad PLUS" />
              <Area type="monotone" dataKey="unsubBal" stackId="1" stroke="#F39C12" fill="#F39C12" fillOpacity={0.7} name="Unsubsidized" />
              <Area type="monotone" dataKey="subBal" stackId="1" stroke="#4A90D9" fill="#4A90D9" fillOpacity={0.7} name="Subsidized" />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {chartType === 'payments' && (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={sampled.filter(s => !s.isActual)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tickFormatter={d => fmtDate(d)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${v.toFixed(0)}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmtCurrency(v)} labelFormatter={d => fmtDate(d)} />
              <Bar dataKey="principal" stackId="a" fill="#27AE60" name="Principal" />
              <Bar dataKey="interest" stackId="a" fill="#E74C3C" name="Interest" />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartType === 'pie' && (
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={130} innerRadius={70}
                  dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
                  <Cell fill="#27AE60" />
                  <Cell fill="#E74C3C" />
                </Pie>
                <Tooltip formatter={v => fmtCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
