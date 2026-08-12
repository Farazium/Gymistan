// Asking the server, in a way the cache cannot answer.
//
// This exists because an ordinary reply is not evidence of a connection. The
// service worker serves reads from its cache with status 200, and from the
// client's side that is indistinguishable from the server having answered: same
// status, same body, same headers. Trusting it means the app says "back online"
// to someone holding an unplugged cable, and — worse — keeps resetting the
// offline session leash from its own cache, so a device that never reaches a
// server again is never signed out either.
//
// The `__probe` parameter is excluded from the worker's API cache in
// vite.config.js, so this one request has to go to the network or fail. It is
// the only thing in the app that can honestly say the server is there.

import api from '../api/axios'
import useNetStore from '../store/netStore'
import { markServerSeen } from './offlineSession'

/**
 * True when the server answered — including with a refusal, which had to come
 * from somewhere. False only for silence.
 *
 * Marks the connection state and stamps the leash as a side effect, since every
 * caller wants both and forgetting one is how the two drift apart.
 */
export async function probeServer() {
  try {
    await api.get('/auth/me/', { params: { __probe: Date.now() } })
  } catch (error) {
    if (!error.response) {
      useNetStore.getState().markOffline()
      return false
    }
    // A 401 or a 500 still proves there is a server on the other end.
  }
  useNetStore.getState().markOnline()
  markServerSeen()
  return true
}
