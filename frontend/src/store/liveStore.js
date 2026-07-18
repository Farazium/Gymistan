import { create } from 'zustand'

// Whether the Live entrance feed is running. Kept app-wide (not inside the
// Attendance page) so leaving that page doesn't stop the sounds — the monitor
// keeps going while you work elsewhere.
const useLiveStore = create((set) => ({
  live: false,
  setLive: (v) => set({ live: v }),
}))

export default useLiveStore
