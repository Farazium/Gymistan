import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import AppLayout from './components/layout/AppLayout'
import Landing from './pages/landing/Landing'
import DemoBoot from './pages/demo/DemoBoot'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import Members from './pages/members/Members'
import Packages from './pages/packages/Packages'
import Payments from './pages/payments/Payments'
import Expenses from './pages/expenses/Expenses'
import Gyms from './pages/superadmin/Gyms'
import GymProfile from './pages/superadmin/GymProfile'
import Tiers from './pages/superadmin/Tiers'
import GymPayments from './pages/superadmin/GymPayments'
import WhatsAppCredits from './pages/superadmin/WhatsAppCredits'
import Inventory from './pages/inventory/Inventory'
import MemberProfile from './pages/members/MemberProfile'
import Finance from './pages/finance/Finance'
import Trainers from './pages/trainers/Trainers'
import TrainerProfile from './pages/trainers/TrainerProfile'
import Attendance from './pages/attendance/Attendance'
import Settings from './pages/settings/Settings'
import useAuthStore from './store/authStore'
import { animationsOn } from './utils/animations'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
})

// "Fill from cursor" on button hover: anchor the accent disc at the point where
// the pointer first sits on a button and let it grow from there; on leave, move
// the origin to the exit point so it collapses back that way. The origin is
// locked for the duration of one hover (data-filled flag) so it doesn't chase
// the cursor around. The disc is sized to reach the button's farthest corner,
// so it covers fully yet expands gradually regardless of button size.
//
// An account with animations switched off has no disc to place, and this is
// pointer-rate work — a tree walk per move, and a getBoundingClientRect that
// forces layout on entering a button, which is exactly what makes a long table
// feel sticky on an older machine. The check is inside the handlers rather than
// around the effect because the switch can be thrown mid-session.
function useButtonCursorFill() {
  useEffect(() => {
    const place = (btn, e) => {
      const r = btn.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      const radius = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y))
      btn.style.setProperty('--mx', `${x}px`)
      btn.style.setProperty('--my', `${y}px`)
      btn.style.setProperty('--fill-d', `${radius * 2}px`)
    }
    const onMove = (e) => {
      if (!animationsOn()) return
      const btn = e.target.closest?.('button:not(.no-fx)')
      if (!btn || btn.dataset.filled) return   // already anchored this hover
      btn.dataset.filled = '1'
      place(btn, e)
    }
    const onOut = (e) => {
      if (!animationsOn()) return
      const btn = e.target.closest?.('button:not(.no-fx)')
      if (!btn || btn.contains(e.relatedTarget)) return  // still inside
      place(btn, e)                            // collapse toward the exit point
      delete btn.dataset.filled                // re-arm for the next hover
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerout', onOut, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerout', onOut)
    }
  }, [])
}

// An unknown URL sends signed-in users to their dashboard and everyone else to
// the landing page — a stranger who mistypes a path should meet the product, not
// a sign-in form.
function NotFoundRedirect() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return <Navigate to={isAuthenticated ? '/dashboard' : '/'} replace />
}

export default function App() {
  useButtonCursorFill()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public: the marketing page at the root, and the door into the
              sample-data demo. Everything below /login is the product. */}
          <Route path="/" element={<Landing />} />
          <Route path="/demo" element={<DemoBoot />} />
          <Route path="/login" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/members" element={<Members />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/members/:id" element={<MemberProfile />} />
            <Route path="/trainers" element={<Trainers />} />
            <Route path="/trainers/:id" element={<TrainerProfile />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin/gyms" element={<Gyms />} />
            <Route path="/admin/gyms/:id" element={<GymProfile />} />
            <Route path="/admin/subscriptions" element={<GymPayments />} />
            <Route path="/admin/whatsapp-credits" element={<WhatsAppCredits />} />
            <Route path="/admin/tiers" element={<Tiers />} />
          </Route>
          <Route path="*" element={<NotFoundRedirect />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </QueryClientProvider>
  )
}
