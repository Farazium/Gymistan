import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api/axios'

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
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)

export default useAuthStore
