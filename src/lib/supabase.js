// Mock Supabase client for demo mode
// Mimics the Supabase query builder API using in-memory state
import { DEMO_LOANS, DEMO_BUDGET, DEMO_EXPENSES, DEMO_PAYMENTS } from './demoData'

// Deep clone helper
function clone(obj) { return JSON.parse(JSON.stringify(obj)) }

// In-memory database
let db = {
  loans: clone(DEMO_LOANS),
  budget_config: clone(DEMO_BUDGET),
  expenses: clone(DEMO_EXPENSES),
  payments: clone(DEMO_PAYMENTS),
}

// Reset to initial state
export function resetDemoData() {
  db = {
    loans: clone(DEMO_LOANS),
    budget_config: clone(DEMO_BUDGET),
    expenses: clone(DEMO_EXPENSES),
    payments: clone(DEMO_PAYMENTS),
  }
}

// Query builder that mimics Supabase's chainable API
class MockQueryBuilder {
  constructor(table) {
    this._table = table
    this._filters = []
    this._order = null
    this._ascending = true
    this._limit = null
    this._operation = 'select'
    this._data = null
    this._selectCols = '*'
  }

  select(cols = '*') {
    this._operation = 'select'
    this._selectCols = cols
    return this
  }

  insert(data) {
    this._operation = 'insert'
    this._data = Array.isArray(data) ? data : [data]
    return this._execute()
  }

  update(data) {
    this._operation = 'update'
    this._data = data
    return this
  }

  delete() {
    this._operation = 'delete'
    return this
  }

  eq(field, value) {
    this._filters.push(row => String(row[field]) === String(value))
    return this
  }

  order(field, opts = {}) {
    this._order = field
    this._ascending = opts.ascending !== false
    return this
  }

  limit(n) {
    this._limit = n
    return this
  }

  // Execute and return promise
  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }

  async _execute() {
    const table = this._table
    let rows = db[table] || []

    if (this._operation === 'select') {
      let result = clone(rows)
      // Apply filters
      for (const f of this._filters) {
        result = result.filter(f)
      }
      // Apply order
      if (this._order) {
        result.sort((a, b) => {
          let va = a[this._order], vb = b[this._order]
          if (typeof va === 'string') va = va.toLowerCase()
          if (typeof vb === 'string') vb = vb.toLowerCase()
          if (va < vb) return this._ascending ? -1 : 1
          if (va > vb) return this._ascending ? 1 : -1
          return 0
        })
      }
      if (this._limit) result = result.slice(0, this._limit)
      return { data: result, error: null }
    }

    if (this._operation === 'insert') {
      const newRows = this._data.map(row => ({
        id: row.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...row,
        created_at: new Date().toISOString(),
      }))
      db[table] = [...db[table], ...newRows]
      return { data: newRows, error: null }
    }

    if (this._operation === 'update') {
      let updated = 0
      db[table] = db[table].map(row => {
        const match = this._filters.every(f => f(row))
        if (match) {
          updated++
          return { ...row, ...this._data }
        }
        return row
      })
      return { data: null, error: null, count: updated }
    }

    if (this._operation === 'delete') {
      const before = db[table].length
      db[table] = db[table].filter(row => !this._filters.every(f => f(row)))
      return { data: null, error: null, count: before - db[table].length }
    }

    return { data: null, error: null }
  }
}

// Mock Supabase client
export const supabase = {
  from(table) {
    return new MockQueryBuilder(table)
  }
}
