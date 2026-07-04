import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import AppLayout from './components/layout/AppLayout'
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
import Inventory from './pages/inventory/Inventory'
import MemberProfile from './pages/members/MemberProfile'
import Finance from './pages/finance/Finance'
import Trainers from './pages/trainers/Trainers'
import TrainerProfile from './pages/trainers/TrainerProfile'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
            <Route path="/finance" element={<Finance />} />
            <Route path="/admin/gyms" element={<Gyms />} />
            <Route path="/admin/gyms/:id" element={<GymProfile />} />
            <Route path="/admin/subscriptions" element={<GymPayments />} />
            <Route path="/admin/tiers" element={<Tiers />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </QueryClientProvider>
  )
}
