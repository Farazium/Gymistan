import { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import useAuthStore from '../../store/authStore'
import { applyTheme, applySurface } from '../../utils/theme'

export default function AppLayout() {
  const { isAuthenticated, refreshUser, user } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) refreshUser()
  }, [])

  // Re-color the app to the gym's chosen accent + surface whenever they change.
  useEffect(() => {
    applyTheme(user?.gym_theme)
    applySurface(user?.gym_card)
  }, [user?.gym_theme, user?.gym_card])

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url('/Gym_BG.jpg')" }}>
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
