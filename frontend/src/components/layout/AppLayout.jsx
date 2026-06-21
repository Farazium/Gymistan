import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import useAuthStore from '../../store/authStore'

export default function AppLayout() {
  const { isAuthenticated } = useAuthStore()
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
