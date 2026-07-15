import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, CreditCard, Receipt,
  Building2, LogOut, Dumbbell, Boxes, Settings, Fingerprint, Wallet, BarChart2, UserCog, MessageCircle
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/members', icon: Users, label: 'Members' },
  { to: '/trainers', icon: UserCog, label: 'Trainers' },
  { to: '/packages', icon: Package, label: 'Packages' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/inventory', icon: Boxes, label: 'Inventory' },
  { to: '/finance', icon: BarChart2, label: 'Finance' },
]

const superAdminItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/gyms', icon: Building2, label: 'Gyms' },
  { to: '/admin/subscriptions', icon: Wallet, label: 'Subscriptions' },
  { to: '/admin/whatsapp-credits', icon: MessageCircle, label: 'WhatsApp Credits' },
  { to: '/admin/tiers', icon: Package, label: 'Tiers' },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)

  const handleLogout = () => {
    logout()
    navigate('/login')
    toast.success('Logged out')
  }

  const items = user?.role === 'SUPERADMIN' ? superAdminItems : navItems

  return (
    <>
      <aside className="w-64 min-h-screen surface flex flex-col border-r border-gray-700/50">
        <div className="p-6 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Dumbbell size={20} className="text-primary-400" />
            </div>
            <div className="min-w-0">
              <p className="text-primary-400 font-bold text-xs tracking-widest uppercase leading-none">Gymistan</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-400'
                    : 'text-gray-400 hover:bg-primary-500/10 hover:text-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {user?.role !== 'SUPERADMIN' && hasAttendance && (
            <NavLink
              to="/attendance"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-primary-500/15 text-primary-400' : 'text-gray-400 hover:bg-primary-500/10 hover:text-gray-100'
                }`
              }
            >
              <Fingerprint size={18} />
              Attendance
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700/50 space-y-1">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary-500/10 transition group"
          >
            <div className="w-8 h-8 bg-gray-700 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.gym_logo
                ? <img src={`http://localhost:8000${user.gym_logo}`} alt="logo" className="w-full h-full object-cover" />
                : user?.name?.[0]?.toUpperCase()
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{user?.gym_name || 'Super Admin'}</p>
            </div>
            <Settings size={14} className="text-gray-500 group-hover:text-gray-300 transition flex-shrink-0" />
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-primary-500/10 hover:text-gray-100 text-sm transition-all"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}
