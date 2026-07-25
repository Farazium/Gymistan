import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import api from '../api/axios'
import { isDemo } from '../demo'

/* Where the signed-in user is persisted. A demo runs in sessionStorage, so it
   lives and dies with its tab and can never overwrite a real session the same
   person has open in another one. The choice is made per call, not once at
   module load, because the demo flag is set after this store is created. */
const authStorage = createJSONStorage(() => {
  const store = () => (isDemo() ? sessionStorage : localStorage)
  return {
    getItem: (k) => store().getItem(k),
    setItem: (k, v) => store().setItem(k, v),
    removeItem: (k) => store().removeItem(k),
  }
})

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login/', { email, password })
        localStorage.setItem('access_token', data.access)
        localStorage.setItem('refresh_token', data.refresh)
        set({ user: data.user, isAuthenticated: true })
        return data.user
      },

      // Public demo: sign in as the sample gym's owner with no request at all.
      // Nothing is written to localStorage — the demo flag is already set by the
      // time this runs, so persist() puts this user in sessionStorage instead.
      startDemo: (user) => set({ user, isAuthenticated: true }),

      logout: () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, isAuthenticated: false })
      },

      setUser: (user) => set({ user }),

      refreshUser: async () => {
        try {
          const { data } = await api.get('/auth/me/')
          // Superadmin has no gym to persist appearance on, so their theme/card/
          // background are kept device-locally — re-apply them over the fresh /me.
          if (!data.gym) {
            data.gym_theme = localStorage.getItem('sa_theme') || data.gym_theme
            data.gym_card = localStorage.getItem('sa_card') || data.gym_card
            data.gym_background_mode = localStorage.getItem('sa_bg_mode') || data.gym_background_mode
            data.gym_background_image = localStorage.getItem('sa_bg_image') || data.gym_background_image
          }
          set({ user: data })
        } catch { /* keep the last known user on a transient failure */ }
      },
    }),
    {
      name: 'auth-storage',
      storage: authStorage,
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)

export default useAuthStore
