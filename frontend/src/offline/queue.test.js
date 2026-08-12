import { describe, it, expect, beforeEach, vi } from 'vitest'

// Each test gets a module registry of its own, because db.js caches its
// connection promise — without the reset, test two would still be talking to
// test one's (now discarded) database.
let queue
beforeEach(async () => {
  vi.resetModules()
  queue = await import('./queue')
})

const write = (over = {}) => ({
  method: 'POST', url: '/payments/', data: { amount: '3000' },
  label: 'Payment', userId: 1, ...over,
})

describe('the offline write queue', () => {
  it('holds a write and marks it pending', async () => {
    const record = await queue.enqueue(write())

    expect(record.id).toBeTypeOf('number')
    expect(record.status).toBe(queue.PENDING)
    expect(record.attempts).toBe(0)
    expect(await queue.pendingFor(1)).toHaveLength(1)
  })

  it('keeps the key it was given', async () => {
    // The whole safety story rests on this: the key must be the one the failed
    // request already carried, because that is the one the server may have seen.
    const record = await queue.enqueue(write({ key: 'key-from-the-first-attempt' }))
    expect(record.key).toBe('key-from-the-first-attempt')
  })

  it('mints a key when there is none', async () => {
    const record = await queue.enqueue(write())
    expect(record.key).toBeTruthy()
  })

  it('gives every write its own key', async () => {
    const a = await queue.enqueue(write())
    const b = await queue.enqueue(write())
    expect(a.key).not.toBe(b.key)
  })

  it('replays in the order things were entered', async () => {
    await queue.enqueue(write({ label: 'first' }))
    await queue.enqueue(write({ label: 'second' }))
    await queue.enqueue(write({ label: 'third' }))

    const order = (await queue.pendingFor(1)).map((r) => r.label)
    expect(order).toEqual(['first', 'second', 'third'])
  })

  it('keeps one user out of another user\'s queue', async () => {
    // A shared desk machine: replaying the accountant's payments under the
    // owner's token would stamp the wrong name on `collected_by`.
    await queue.enqueue(write({ userId: 1 }))
    await queue.enqueue(write({ userId: 2 }))

    expect(await queue.pendingFor(1)).toHaveLength(1)
    expect(await queue.pendingFor(2)).toHaveLength(1)
  })

  it('gives an unattributed write to whoever is here now', async () => {
    // Better than stranding a payment nobody can ever send.
    await queue.enqueue(write({ userId: null }))
    expect(await queue.pendingFor(7)).toHaveLength(1)
  })

  it('counts pending and failed apart', async () => {
    const a = await queue.enqueue(write())
    await queue.enqueue(write())
    await queue.update(a.id, { status: queue.FAILED, error: 'nope' })

    expect(await queue.countFor(1)).toEqual({ pending: 1, failed: 1 })
  })

  it('puts a failed write back on retry', async () => {
    const record = await queue.enqueue(write())
    await queue.update(record.id, { status: queue.FAILED, error: 'amount: required' })

    const retried = await queue.retry(record.id)
    expect(retried.status).toBe(queue.PENDING)
    // The old complaint must not linger — it is about an attempt that is over.
    expect(retried.error).toBeNull()
  })

  it('forgets a discarded write', async () => {
    const record = await queue.enqueue(write())
    await queue.remove(record.id)
    expect(await queue.entriesFor(1)).toHaveLength(0)
  })

  it('tells subscribers when anything changes', async () => {
    const seen = vi.fn()
    const stop = queue.subscribe(seen)

    const record = await queue.enqueue(write())
    await queue.update(record.id, { attempts: 1 })
    await queue.remove(record.id)

    expect(seen).toHaveBeenCalledTimes(3)
    stop()
    await queue.enqueue(write())
    expect(seen).toHaveBeenCalledTimes(3)
  })

  it('survives a listener that throws', async () => {
    queue.subscribe(() => { throw new Error('broken listener') })
    const good = vi.fn()
    queue.subscribe(good)

    await queue.enqueue(write())
    expect(good).toHaveBeenCalled()
  })
})
