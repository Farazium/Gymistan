import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Package, CreditCard, Receipt,
  Building2, LogOut, Dumbbell, Boxes, Settings, Fingerprint, Wallet, BarChart2, UserCog, MessageCircle, X
} from 'lucide-react'
import useAuthStore from '../../store/authStore'
import useLiveStore from '../../store/liveStore'
import { initAudio } from '../../utils/entranceSound'
import { API_ORIGIN } from '../../api/axios'
import { isDemo, exitDemo } from '../../demo'
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

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuthStore()
  const { live, setLive } = useLiveStore()
  const navigate = useNavigate()

  const hasAttendance = ['TIER2_AT', 'TIER3'].includes(user?.gym_tier)
  const hasWhatsApp = ['TIER2_WA', 'TIER3'].includes(user?.gym_tier)

  const handleLogout = () => {
    // In the demo there is no account to sign out of — logging out means leaving
    // the sample gym and going back to the landing page.
    if (isDemo()) { exitDemo(); return }
    logout()
    navigate('/login')
    toast.success('Logged out')
  }

  const items = user?.role === 'SUPERADMIN' ? superAdminItems : navItems

  return (
    <>
      {/* Below lg the sidebar is an off-canvas drawer, so a phone gets the whole
          width for the page itself. This scrim both dims the page and gives the
          drawer somewhere to be dismissed from. */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform surface flex flex-col border-r border-gray-700/50 transition-transform duration-300 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Dumbbell size={20} className="text-primary-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-primary-400 font-bold text-xs tracking-widest uppercase leading-none">Gymistan</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="no-fx -mr-2 p-2 rounded-lg text-gray-400 hover:text-gray-200 transition lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable but bar-less: on a short laptop window the menu (nine items
            on Tier 3) doesn't fit, and clipping it would strand Attendance below
            the fold — but a scrollbar drawn beside eight links is just noise. */}
        <nav className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-1">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all origin-left hover:scale-[1.04] ${
                  isActive
                    ? 'sidebar-active scale-[1.04] bg-primary-500/30 text-primary-300 shadow-sm shadow-primary-500/10'
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
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all origin-left hover:scale-[1.04] ${
                  isActive ? 'sidebar-active scale-[1.04] bg-primary-500/30 text-primary-300 shadow-sm shadow-primary-500/10' : 'text-gray-400 hover:bg-primary-500/10 hover:text-gray-100'
                }`
              }
            >
              <Fingerprint size={18} />
              <span className="flex-1">Attendance</span>
              {/* The entrance feed runs app-wide, so the switch for it belongs
                  somewhere always on screen rather than on the Attendance page
                  the desk staff have navigated away from. Nested in the link, so
                  it has to stop the click reaching it — otherwise turning the
                  sound on would also march you off to another page. */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const nv = !live
                  if (nv) initAudio()   // browsers only allow sound off a real click
                  setLive(nv)
                }}
                aria-pressed={live}
                aria-label={live ? 'Stop the live entrance feed' : 'Start the live entrance feed'}
                title={live
                  ? 'Live entrance is on — a sound plays on each scan. Click to stop.'
                  : 'Live entrance is off. Click to hear each scan as it happens.'}
                className="no-fx -mr-1 p-1.5 rounded-md hover:bg-white/10 transition"
              >
                <span
                  className={`block w-2.5 h-2.5 rounded-full transition-colors ${
                    live
                      ? 'bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.55)] animate-pulse'
                      : 'bg-gray-600'
                  }`}
                />
              </button>
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700/50 space-y-1">
          <button
            onClick={() => { onClose(); navigate('/settings') }}
            className="no-fx w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-primary-500/10 transition origin-left hover:scale-[1.04] group"
          >
            <div className="w-8 h-8 bg-gray-700 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.gym_logo
                ? <img src={`${API_ORIGIN}${user.gym_logo}`} alt="logo" className="w-full h-full object-cover" />
                : user?.name?.[0]?.toUpperCase()
              }
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-gray-400 text-xs truncate">{user?.gym_name || 'Super Admin'}</p>
            </div>
            <Settings size={14} className="no-fx text-gray-500 group-hover:text-gray-300 transition flex-shrink-0" />
          </button>
          <button
            onClick={handleLogout}
            className="no-fx w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-primary-500/10 hover:text-gray-100 text-sm transition-all origin-left hover:scale-[1.04]"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}
