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
          set({ user: data })
        } catch {}
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)

export default useAuthStore
