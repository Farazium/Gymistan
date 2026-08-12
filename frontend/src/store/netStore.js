import { create } from 'zustand'

// Whether the app can currently reach the server.
//
// `navigator.onLine` alone is not the answer: on a phone hotspot that has lost
// its data allowance, or a PC still attached to a router with no line behind it,
// the browser cheerfully reports online while every request fails. So the truth
// here is set by what actually happened to the last request — the axios
// interceptor calls `markOffline()` when a call dies with no response at all and
// `markOnline()` on any reply. The browser's own events are still listened to,
// because they are the fastest signal when the cable is physically pulled.
const useNetStore = create((set, get) => ({
  // Optimistic on boot: assume the line is up until a request proves otherwise,
  // so a working desk never flashes an offline bar on first paint.
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  // Set the moment the server answers again after an outage, so the UI can say
  // "back online" rather than silently dropping the bar.
  reconnectedAt: null,

  markOnline: () => {
    if (get().online) return
    set({ online: true, reconnectedAt: Date.now() })
  },
  markOffline: () => {
    if (!get().online) return
    set({ online: false })
  },
}))

/** Wire the browser's own connectivity events. Called once, from main.jsx. */
export function watchConnectivity() {
  if (typeof window === 'undefined') return
  const { markOnline, markOffline } = useNetStore.getState()
  // `online` is only a hint that a network exists — the next successful request
  // is what confirms it, and the interceptor will call markOnline again anyway.
  window.addEventListener('online', markOnline)
  window.addEventListener('offline', markOffline)
}

export default useNetStore
