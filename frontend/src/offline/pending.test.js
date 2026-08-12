// Queued writes are shown as rows in the real tables, so the shapes they are
// turned into have to match what those tables read — and every one of them has
// to be identifiable as not-yet-saved, because a row that looks saved but has no
// server id is the one that gets a slip fetched for it, or gets entered twice.

import { describe, it, expect } from 'vitest'
import {
  pendingPayments, pendingExpenses, pendingMembers, isPendingRow,
} from './pending'

const entry = (over = {}) => ({
  id: 1, method: 'POST', url: '/payments/', data: {}, meta: null,
  status: 'pending', createdAt: Date.UTC(2026, 7, 13, 6, 0), ...over,
})

describe('queued payments as rows', () => {
  const rows = () => pendingPayments([
    entry({
      id: 4,
      data: {
        member: 12, package: 3, amount: '3000', amount_paid: '2000',
        discount: '0', payment_method: 'ONLINE',
      },
      meta: { member_name: 'Ali Raza', member_phone: '03001234567', package_name: 'Monthly' },
    }),
  ])

  it('shows the member by name, not by id', () => {
    // The payload only has the id; the name comes from what the form knew.
    expect(rows()[0].member_name).toBe('Ali Raza')
    expect(rows()[0].member_phone).toBe('03001234567')
  })

  it('works out the balance the same way the server will', () => {
    const row = rows()[0]
    expect(row.remaining).toBe(1000)
    expect(row.status).toBe('PARTIAL')
  })

  it('calls a fully-settled payment paid', () => {
    const [row] = pendingPayments([
      entry({ data: { amount: '3000', amount_paid: '3000', discount: '0' } }),
    ])
    expect(row.status).toBe('PAID')
    expect(row.remaining).toBe(0)
  })

  it('dates it from when the desk entered it', () => {
    expect(rows()[0].payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps a day pass readable without any member at all', () => {
    const [row] = pendingPayments([
      entry({ data: { walkin_name: 'Visitor', amount: '500', amount_paid: '500' } }),
    ])
    expect(row.member_name).toBe('Visitor')
    expect(row.is_walkin).toBe(true)
  })

  it('offers nothing that needs a server id', () => {
    // slip_sent false would normally offer to send a receipt; the row is marked
    // so every action can be withheld instead.
    const row = rows()[0]
    expect(isPendingRow(row)).toBe(true)
    expect(typeof row.id).toBe('string')
    expect(row.id).toMatch(/^pending-/)
  })

  it('ignores queue entries that are not payments', () => {
    expect(pendingPayments([entry({ url: '/expenses/' })])).toHaveLength(0)
    expect(pendingPayments([entry({ url: '/payments/9/whatsapp/' })])).toHaveLength(0)
    expect(pendingPayments([entry({ method: 'PATCH', url: '/payments/' })])).toHaveLength(0)
  })
})

describe('queued expenses as rows', () => {
  it('carries the fields the expenses table reads', () => {
    const [row] = pendingExpenses([
      entry({
        url: '/expenses/',
        data: { title: 'Electricity', category: 'Utilities', amount: '8000', date: '2026-08-12' },
      }),
    ])
    expect(row).toMatchObject({
      title: 'Electricity', category: 'Utilities', amount: '8000', date: '2026-08-12',
    })
    expect(isPendingRow(row)).toBe(true)
  })

  it('falls back to the day it was entered when no date was given', () => {
    const [row] = pendingExpenses([entry({ url: '/expenses/', data: { amount: '100' } })])
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('queued members as rows', () => {
  it('carries the fields the roster reads', () => {
    const [row] = pendingMembers([
      entry({
        url: '/members/',
        data: { name: 'Sana', phone: '03007654321', gender: 'FEMALE', status: 'ACTIVE', expiry_date: '2026-09-13' },
        meta: { package_name: 'Monthly' },
      }),
    ])
    expect(row).toMatchObject({
      name: 'Sana', phone: '03007654321', gender: 'FEMALE', package_name: 'Monthly',
    })
    expect(isPendingRow(row)).toBe(true)
  })

  it('does not treat an edit as a new member', () => {
    // A PATCH changes a row the roster already shows; adding a second one for it
    // would make the member appear twice.
    expect(pendingMembers([entry({ method: 'PATCH', url: '/members/12/' })])).toHaveLength(0)
  })

  it('owes nothing until the server says so', () => {
    const [row] = pendingMembers([entry({ url: '/members/', data: { name: 'X' } })])
    expect(row.dues).toBe(0)
  })
})

describe('telling a made-up row from a saved one', () => {
  it('is false for anything off the server', () => {
    expect(isPendingRow({ id: 3, member_name: 'Ali' })).toBe(false)
    expect(isPendingRow(null)).toBe(false)
    expect(isPendingRow(undefined)).toBe(false)
  })

  it('never hands the server a made-up id', () => {
    // Numeric ids would silently address a real record; these cannot.
    const [row] = pendingPayments([entry({ id: 7 })])
    expect(Number.isNaN(Number(row.id))).toBe(true)
  })
})
