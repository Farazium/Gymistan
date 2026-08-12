// Test environment for the offline queue.
//
// The queue is the one part of the app that cannot be reasoned about without a
// real IndexedDB — transaction lifetimes and autoincrement ordering are exactly
// where a hand-rolled store goes wrong — so the tests run against
// fake-indexeddb, which is the real spec-compliant implementation over an
// in-memory backing store rather than a set of stubs.

import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

// A fresh database per test. Without this the queue from one test is still
// sitting there in the next, and ordering assertions start passing for the
// wrong reasons.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})
