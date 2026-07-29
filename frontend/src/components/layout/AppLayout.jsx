import { useEffect } from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
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

  useEffect(() => {
    if (isAuthenticated) refreshUser()
  }, [])

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      {/* Background stays fixed behind a scrolling content column. */}
      <main className="relative flex-1 overflow-hidden">
        {mode === 'animated'
          ? <AnimatedBackground />
          : imageUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url('${imageUrl}')` }}
              />
            )}
        <div className="relative z-10 h-full overflow-y-auto">
          {demo && <DemoBanner />}
          <div key={location.pathname} className="page-enter p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
      {/* Global entrance feed — keeps running (and sounding) across page changes. */}
      <LiveEntrance />
    </div>
  )
}
