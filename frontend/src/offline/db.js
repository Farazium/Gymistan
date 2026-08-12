// The IndexedDB behind the offline write queue.
//
// Hand-rolled rather than pulled from a library: this needs one store, four
// operations and no migrations worth the name, and the queue is the piece of the
// app that absolutely must still work on a machine that cannot reach npm, let
// alone a CDN. The rest of the app never touches this file — it goes through
// offline/queue.js.
//
// localStorage was not an option. It is synchronous (so a 300-entry queue would
// stutter the desk), capped around 5 MB, and — the part that decides it — it can
// be cleared by the browser as ordinary site data, which is exactly the wrong
// property for the only copy of a payment nobody has written down anywhere else.

const DB_NAME = 'gymistan-offline'
const DB_VERSION = 1
export const STORE = 'writes'

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        // Replay order is the order things were entered at the desk, so the
        // server applies them the way they happened. `createdAt` alone is not
        // unique enough on a fast typist, so `id` breaks the tie — it is the
        // autoincrement, which is insertion order by definition.
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('userId', 'userId')
      }
    }

    request.onsuccess = () => {
      const db = request.result
      // A second tab that upgrades the schema would otherwise leave this
      // connection blocking it forever.
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'))
  })

  // A rejected promise must not be cached, or one failure disables the queue for
  // the lifetime of the tab.
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    try {
      result = fn(store)
    } catch (error) {
      tx.abort()
      reject(error)
      return
    }
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  }))
}

/** Insert a record and return it with the id the store assigned. */
export async function add(record) {
  const id = await run('readwrite', (store) => store.add(record))
  return { ...record, id }
}

/** Every record, oldest first — replay order. */
export function all() {
  return run('readonly', (store) => store.index('createdAt').getAll())
}

export function get(id) {
  return run('readonly', (store) => store.get(id))
}

export async function put(record) {
  await run('readwrite', (store) => store.put(record))
  return record
}

export function remove(id) {
  return run('readwrite', (store) => store.delete(id))
}

export function clear() {
  return run('readwrite', (store) => store.clear())
}

/** True when this browser can hold a queue at all. */
export async function isAvailable() {
  try {
    await open()
    return true
  } catch {
    return false
  }
}
