import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Dumbbell, Eye, EyeOff, Lock, Mail, LogIn, Loader2 } from 'lucide-react'
import anime from 'animejs/lib/anime.es.js'
// The deep-space scene (starfield, cursor glow, dumbbell field, click ripple) is
// shared with the landing page — see components/space.
import { Starfield, CursorGlow, DumbbellField } from '../../components/space/Scene'
import { PREFERS_REDUCED_MOTION, BRAND_ACCENT, spawnRipple } from '../../components/space/effects'
import useAuthStore from '../../store/authStore'
import { isDemo, exitDemo } from '../../demo'
import Modal from '../../components/ui/Modal'
import TermsContent from './TermsContent'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm()
  const contentRef = useRef(null)
  const cardRef = useRef(null)
  const rippleRef = useRef(null)
  const warpRef = useRef(null)
  const successRef = useRef(null)
  const warpingRef = useRef(false)

  // Stop the warp loop if we unmount (i.e. once we've navigated onward).
  useEffect(() => () => { warpingRef.current = false }, [])

  // Arriving at the sign-in form is an unambiguous "I want the real product",
  // so a tab still carrying the demo flag has to shed it here. Otherwise the
  // demo adapter — which accepts any credentials and answers as the sample
  // gym's owner — would swallow the login, and someone typing their own
  // password would land in a gym that isn't theirs.
  useEffect(() => {
    if (isDemo()) exitDemo('/login')
  }, [])

  // Green tick that draws itself in on a successful sign-in, then calls done().
  const playSuccess = (done) => {
    const el = successRef.current
    if (!el || PREFERS_REDUCED_MOTION) { done(); return }
    const badge = el.querySelector('.check-badge')
    const circle = el.querySelector('.check-circle')
    const mark = el.querySelector('.check-mark')
    const cLen = circle.getTotalLength()
    const mLen = mark.getTotalLength()
    circle.style.strokeDasharray = cLen
    circle.style.strokeDashoffset = cLen
    mark.style.strokeDasharray = mLen
    mark.style.strokeDashoffset = mLen
    el.style.opacity = '1'
    // From 0 so the tick appears to emerge from the warp's vanishing point.
    anime({ targets: badge, scale: [0, 1], duration: 600, easing: 'easeOutBack' })
    anime({ targets: circle, strokeDashoffset: [cLen, 0], duration: 520, easing: 'easeInOutSine' })
    anime({
      targets: mark,
      strokeDashoffset: [mLen, 0],
      duration: 380,
      delay: 360,
      easing: 'easeOutSine',
      complete: () => setTimeout(done, 480),
    })
  }

  // Hyperspace jump on a successful sign-in: the card zooms away while stars
  // streak outward from the centre. The streaks keep flowing (they respawn as
  // they leave the screen) and, part-way in, `done()` fires so the tick emerges
  // WHILE the warp is still moving — no freeze between the two.
  const playWarp = (done) => {
    const cv = warpRef.current
    if (!cv || PREFERS_REDUCED_MOTION) { done(); return }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = (cv.width = window.innerWidth * dpr)
    const h = (cv.height = window.innerHeight * dpr)
    const ctx = cv.getContext('2d')
    cv.style.opacity = '1'
    const cx = w / 2
    const cy = h / 2
    const maxD = Math.hypot(w, h)
    const spawn = () => ({ a: Math.random() * Math.PI * 2, d: Math.random() * 40 * dpr, sp: (3 + Math.random() * 7) * dpr })
    const lines = Array.from({ length: 220 }, spawn)
    if (contentRef.current) {
      anime({ targets: contentRef.current, scale: [1, 1.25], opacity: [1, 0], duration: 650, easing: 'easeInQuad' })
    }
    warpingRef.current = true
    let t = 0
    let tickFired = false
    const run = () => {
      if (!warpingRef.current) return
      t++
      ctx.fillStyle = 'rgba(5, 7, 14, 0.2)' // trailing fade → motion-blur streaks
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        if (l.d > maxD) continue // gone off-screen; once tickFired we don't respawn
        const x1 = cx + Math.cos(l.a) * l.d
        const y1 = cy + Math.sin(l.a) * l.d
        l.d += l.sp * (1 + t / 22)
        const x2 = cx + Math.cos(l.a) * l.d
        const y2 = cy + Math.sin(l.a) * l.d
        ctx.strokeStyle = `rgba(150, 190, 255, ${Math.min(1, l.d / (200 * dpr))})`
        ctx.lineWidth = 1.6 * dpr
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        // Keep the field flowing while warping; stop respawning once the tick
        // starts so no new streaks appear to spill out from behind it.
        if (l.d > maxD && !tickFired) lines[i] = spawn()
      }
      // Let the tick start emerging mid-warp, with the streaks still flowing.
      if (t === 26 && !tickFired) { tickFired = true; done() }
      requestAnimationFrame(run)
    }
    requestAnimationFrame(run)
  }

  // A water-drop ripple wherever the user taps — but not over the sign-in card
  // itself, only across the open space around it.
  const onRipple = (e) =>
    spawnRipple(e, rippleRef.current, (t) => cardRef.current?.contains(t))

  // Staggered entrance for the brand + card + footer, and a breathing logo glow.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const targets = root.querySelectorAll('[data-reveal]')
    if (PREFERS_REDUCED_MOTION) {
      targets.forEach((el) => { el.style.opacity = '1' })
      return
    }
    anime({
      targets: targets,
      opacity: [0, 1],
      translateY: [18, 0],
      delay: anime.stagger(90, { start: 150 }),
      duration: 750,
      easing: 'easeOutCubic',
    })
    anime({
      targets: root.querySelector('.logo-glow'),
      opacity: [0.3, 0.7],
      scale: [0.9, 1.12],
      duration: 2200,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    })
    return () => anime.remove(root.querySelectorAll('[data-reveal], .logo-glow'))
  }, [])

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const user = await login(data.email, data.password)
      toast.success(`Welcome back, ${user.name}!`)
      // Hyperspace jump → a green tick emerges from the warp → dashboard. Keep
      // the button in its loading state throughout, since we're leaving anyway.
      playWarp(() => playSuccess(() => navigate('/dashboard')))
    } catch (err) {
      const msg = err.response?.data?.non_field_errors?.[0]
        || err.response?.data?.detail
        || 'Invalid credentials'
      toast.error(msg)
      if (!PREFERS_REDUCED_MOTION && cardRef.current) {
        anime({
          targets: cardRef.current,
          translateX: [0, -11, 9, -7, 5, 0],
          duration: 450,
          easing: 'easeInOutSine',
        })
      }
      setLoading(false)
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-slate-950"
      style={BRAND_ACCENT}
      onPointerDown={onRipple}
    >
      {/* Deep-space backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <Starfield />
      <CursorGlow />

      <DumbbellField />

      {/* Ripple rings spawn here — above the scene, never blocking clicks */}
      <div ref={rippleRef} className="ripple-layer z-30" />

      {/* Hyperspace warp overlay — hidden until a successful sign-in */}
      <canvas
        ref={warpRef}
        className="pointer-events-none absolute inset-0 z-40 h-full w-full opacity-0"
      />

      {/* Green success tick — draws itself in before the warp */}
      <div ref={successRef} className="pointer-events-none absolute inset-0 z-[45] grid place-items-center opacity-0">
        <div className="check-badge" style={{ filter: 'drop-shadow(0 0 22px rgba(34,197,94,0.55))' }}>
          <svg width="92" height="92" viewBox="0 0 52 52">
            <circle className="check-circle" cx="26" cy="26" r="24" fill="none" stroke="#22c55e" strokeWidth="2.5" />
            <path className="check-mark" d="M15 27 l7.5 7.5 L38 18" fill="none" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Sign-in card */}
      <div ref={contentRef} className="relative w-full max-w-md">
        <div className="text-center mb-7">
          <div data-reveal className="mb-4" style={{ opacity: 0 }}>
            <div className="relative inline-flex">
              <div className="logo-glow absolute inset-0 rounded-2xl bg-primary-500/40 blur-xl" style={{ opacity: 0.3 }} />
              <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-600/30 ring-1 ring-white/10 transition-transform duration-300 hover:-translate-y-1 hover:scale-105">
                <Dumbbell size={30} className="text-white" strokeWidth={2} />
              </div>
            </div>
          </div>
          <h1 data-reveal className="text-3xl font-bold text-white tracking-tight" style={{ opacity: 0 }}>Gymistan</h1>
          <p data-reveal className="text-primary-200/80 mt-1 text-sm" style={{ opacity: 0 }}>Gym Management, built for Pakistan</p>
        </div>

        <div
          ref={cardRef}
          data-reveal
          className="bg-slate-900/70 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/40 p-8 border border-white/10"
          style={{ opacity: 0 }}
        >
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Welcome back</h2>
          <p className="text-gray-400 text-sm mb-6">Sign in to manage your gym</p>

          <form onSubmit={(e) => handleSubmit(onSubmit)(e)} className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <div className="group relative rounded-lg transition-shadow focus-within:shadow-lg focus-within:shadow-primary-500/10">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-300 pointer-events-none z-10" />
                <input
                  type="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  {...register('email', { required: 'Email is required' })}
                />
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="group relative rounded-lg transition-shadow focus-within:shadow-lg focus-within:shadow-primary-500/10">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary-300 pointer-events-none z-10" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="no-fx absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition z-10"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2 relative overflow-hidden"
            >
              <span className="btn-shimmer-sweep absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <span className="relative inline-flex items-center gap-2">
                {loading
                  ? <><Loader2 size={16} className="animate-spin" /> Signing in...</>
                  : <><LogIn size={16} /> Sign in</>}
              </span>
            </button>
          </form>
        </div>

        <p data-reveal className="text-center text-gray-400 text-xs mt-6 leading-relaxed" style={{ opacity: 0 }}>
          By signing in you agree to our{' '}
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="no-fx text-primary-300 hover:text-primary-200 underline underline-offset-2 transition"
          >
            Terms &amp; Conditions
          </button>
          <br />
          <span className="text-gray-500">Gymistan © {new Date().getFullYear()}</span>
        </p>
      </div>

      <Modal isOpen={showTerms} onClose={() => setShowTerms(false)} title="Terms & Conditions" size="lg">
        <TermsContent />
      </Modal>
    </div>
  )
}
