import { useEffect, useState } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { Menu, Dumbbell } from 'lucide-react'
import Sidebar from './Sidebar'
import LiveEntrance from '../LiveEntrance'
import AnimatedBackground from '../AnimatedBackground'
import DemoBanner from '../DemoBanner'
import useAuthStore from '../../store/authStore'
import { applyTheme, applySurface } from '../../utils/theme'
import { animationsEnabled, applyAnimations, clearAnimations } from '../../utils/animations'
import { mediaUrl } from '../../utils/mediaUrl'
import { isDemo } from '../../demo'

export default function AppLayout() {
  const { isAuthenticated, refreshUser, user } = useAuthStore()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (isAuthenticated) refreshUser()
  }, [])

  // A phone navigates by opening the drawer, so it has to shut itself once the
  // new page is on screen — including when the browser's back button moved us.
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  // Re-color the app to the gym's chosen accent + surface whenever they change.
  useEffect(() => {
    applyTheme(user?.gym_theme)
    applySurface(user?.gym_card)
  }, [user?.gym_theme, user?.gym_card])

  // The animations switch is per account, so it is worn only inside the app —
  // signing out hands the public pages back their own motion.
  useEffect(() => {
    applyAnimations(user?.id)
    return clearAnimations
  }, [user?.id])

  if (!isAuthenticated) return <Navigate to="/login" replace />
  const demo = isDemo()

  // Background: packaged image, the animated starfield, or the gym's upload.
  // The starfield is a gym-wide choice but animations are an account-wide one,
  // so a colleague picking it can't start a frame loop on a machine that asked
  // for stillness — that account falls back to the packaged image.
  const saved = user?.gym_background_mode || 'default'
  const mode = saved === 'animated' && !animationsEnabled(user?.id) ? 'default' : saved
  const uploadUrl = mediaUrl(user?.gym_background_image)
  const imageUrl = mode === 'upload' && uploadUrl ? uploadUrl
    : mode === 'default' ? '/Gym_BG.jpg'
    : null // animated

  return (
    // h-dvh over h-screen: on a phone the address bar collapses, and 100vh
    // would leave the bottom of every page under it.
    <div className="flex h-screen h-dvh overflow-hidden">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {/* Background stays fixed behind a scrolling content column. min-w-0 so a
          wide table scrolls inside its own card instead of stretching the page. */}
      <main className="relative flex-1 min-w-0 overflow-hidden">
        {mode === 'animated'
          ? <AnimatedBackground />
          : imageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url('${imageUrl}')` }}
              />
            )}
        <div className="relative z-10 h-full overflow-y-auto">
          {/* The drawer's handle. Only below lg, where the sidebar is hidden. */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-700/50 px-4 py-3 backdrop-blur-md lg:hidden"
            style={{ backgroundColor: 'rgb(var(--surface) / 0.85)' }}>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="no-fx -ml-1 p-2 rounded-lg text-gray-300 transition hover:bg-primary-500/10 hover:text-white"
            >
              <Menu size={20} />
            </button>
            <span className="flex items-center gap-2 min-w-0">
              <Dumbbell size={16} className="text-primary-400 flex-shrink-0" />
              <span className="truncate text-sm font-semibold text-gray-100">
                {user?.gym_name || 'Gymistan'}
              </span>
            </span>
          </header>
          {demo && <DemoBanner />}
          <div key={location.pathname} className="page-enter p-4 sm:p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
      {/* Global entrance feed — keeps running (and sounding) across page changes. */}
      <LiveEntrance />
    </div>
  )
}
