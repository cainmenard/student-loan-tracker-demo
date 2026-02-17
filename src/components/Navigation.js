'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resetDemoData } from '@/lib/supabase'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/import', label: 'Import CSV', icon: '📥' },
  { href: '/advisor', label: 'Payment Advisor', icon: '🎯' },
  { href: '/loans', label: 'Loan Details', icon: '🏦' },
  { href: '/budget', label: 'Monthly Budget', icon: '💰' },
  { href: '/amortization', label: 'Amortization', icon: '📉' },
  { href: '/payments', label: 'Payment Log', icon: '📝' },
  { href: '/scenarios', label: 'What-If Scenarios', icon: '🔮' },
]

export default function Navigation() {
  const pathname = usePathname()
  const [resetting, setResetting] = useState(false)

  function handleReset() {
    resetDemoData()
    setResetting(true)
    setTimeout(() => { window.location.reload() }, 100)
  }

  return (
    <nav className="fixed left-0 top-0 h-full w-64 bg-navy-700 text-white flex flex-col z-50">
      <div className="p-6 border-b border-navy-500/30">
        <h1 className="text-lg font-bold tracking-tight">Student Loan</h1>
        <p className="text-sm text-blue-300 font-medium">Payoff Tracker</p>
        <div className="mt-2 px-2 py-1 bg-amber-500/20 rounded text-amber-300 text-xs font-semibold text-center">
          INTERACTIVE DEMO
        </div>
      </div>

      <div className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all
                ${isActive
                  ? 'bg-white/10 text-white border-r-3 border-blue-400'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-navy-500/30 space-y-3">
        <button onClick={handleReset} disabled={resetting}
          className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium text-blue-200 transition-all">
          {resetting ? 'Resetting...' : '↺ Reset Demo Data'}
        </button>
        <div className="text-xs text-gray-400 space-y-1">
          <p>Built with Next.js + Supabase</p>
          <p>Blue fields = editable</p>
          <p className="text-gray-500">All data is simulated</p>
        </div>
      </div>
    </nav>
  )
}
