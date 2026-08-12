// The allowlist decides what the desk may do with no line behind it. Getting a
// route wrong in the permissive direction is worse than not queueing at all: the
// desk is told the thing was saved, and it either does something different by
// the time it lands or cannot be replayed at all. So the refusals are tested at
// least as carefully as the acceptances.

import { describe, it, expect } from 'vitest'
import { isQueueable, describeWrite } from './queueable'

const q = (method, url, data) => isQueueable({ method, url, data })

describe('what may wait on the device', () => {
  it.each([
    ['a payment', 'post', '/payments/'],
    ['an expense', 'post', '/expenses/'],
    ['a new member', 'post', '/members/'],
    ['a member edit (PATCH)', 'patch', '/members/42/'],
    ['a member edit (PUT)', 'put', '/members/42/'],
    ['a stock movement', 'post', '/inventory/7/adjust/'],
  ])('queues %s', (_label, method, url) => {
    expect(q(method, url)).toBe(true)
  })

  it('matches whether the url is relative or absolute', () => {
    expect(q('post', 'http://localhost:8000/api/payments/')).toBe(true)
  })

  it('ignores a query string', () => {
    expect(q('post', '/payments/?foo=1')).toBe(true)
  })
})

describe('what may not', () => {
  it.each([
    // External side effects against a live credit balance. Replayed a day late,
    // these message a member about something long since dealt with.
    ['a WhatsApp receipt', 'post', '/payments/12/whatsapp/'],
    ['an expiry reminder', 'post', '/members/12/reminder/'],
    ['a dues reminder', 'post', '/members/12/dues-reminder/'],
    // Deletes depend on the server's state right now — the newest-payment rule
    // and the 24-hour window are both facts about now, not about an hour ago.
    ['deleting a payment', 'delete', '/payments/12/'],
    ['deleting a member', 'delete', '/members/12/'],
    ['deleting an expense', 'delete', '/expenses/12/'],
    ['a hard delete', 'post', '/members/12/hard-delete/'],
    // Cannot be deferred, or is not the desk's outage to solve.
    ['signing in', 'post', '/auth/login/'],
    ['a superadmin gym', 'post', '/gyms/'],
    ['restoring a member', 'post', '/members/12/restore/'],
    ['blacklisting', 'post', '/members/12/blacklist/'],
    ['a package', 'post', '/packages/'],
    ['a trainer', 'post', '/trainers/'],
    // Reads are never queued.
    ['reading payments', 'get', '/payments/'],
  ])('refuses %s', (_label, method, url) => {
    expect(q(method, url)).toBe(false)
  })

  it('refuses a multipart body whatever the route', () => {
    // A File handle does not survive being written to IndexedDB and read back.
    expect(q('post', '/members/', new FormData())).toBe(false)
  })

  it.each([
    ['an update to one payment', 'post', '/payments/12/'],
    ['a non-numeric member id', 'patch', '/members/abc/'],
    ['a neighbouring inventory route', 'post', '/inventory/7/logs/'],
  ])('does not let %s slip through on a near-miss path', (_label, method, url) => {
    expect(q(method, url)).toBe(false)
  })
})

describe('labels for the pending list', () => {
  it.each([
    ['post', '/payments/', 'Payment'],
    ['post', '/members/', 'New member'],
    ['patch', '/members/9/', 'Member edit'],
    ['post', '/expenses/', 'Expense'],
    ['post', '/inventory/7/adjust/', 'Stock change'],
  ])('%s %s reads as "%s"', (method, url, expected) => {
    expect(describeWrite({ method, url })).toBe(expected)
  })
})
