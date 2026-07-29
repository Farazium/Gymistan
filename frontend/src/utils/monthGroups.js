// Month grouping for the ledger-style lists (Payments, Expenses): both cut a
// date-sorted list into months, and both show each month as a section that can
// be folded shut.
import { useState } from 'react'

export const monthKey = (dateStr) => (dateStr ? dateStr.slice(0, 7) : '')

export function monthLabel(yyyymm) {
  const [y, m] = yyyymm.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })
}

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Walk an already date-sorted list and cut it into consecutive month runs.
export function groupByMonth(sorted, dateOf) {
  const groups = []
  for (const item of sorted) {
    const key = monthKey(dateOf(item))
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, label: monthLabel(key), items: [] })
    groups[groups.length - 1].items.push(item)
  }
  return groups
}

// Which month sections are expanded. The running month starts open and every
// older one starts shut, so the page opens on this month's work instead of a
// year of history. Only the months actually clicked are remembered — months
// that appear later (after a filter change) still get the default.
export function useMonthSections() {
  const [overrides, setOverrides] = useState({})
  const current = currentMonthKey()
  const isOpen = (key) => overrides[key] ?? key === current
  const toggle = (key) => setOverrides((o) => ({ ...o, [key]: !isOpen(key) }))
  return { isOpen, toggle }
}
