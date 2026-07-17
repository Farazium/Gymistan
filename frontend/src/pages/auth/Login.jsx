import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Dumbbell, Eye, EyeOff, Lock, Mail, LogIn, Loader2 } from 'lucide-react'
import anime from 'animejs/lib/anime.es.js'
import useAuthStore from '../../store/authStore'
import Modal from '../../components/ui/Modal'
import TermsContent from './TermsContent'
import toast from 'react-hot-toast'

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ----------------------------------------------------------------------------
   Starfield — a canvas of twinkling stars that drift a little with the cursor.
   Canvas (not DOM) so a few hundred points stay cheap.
---------------------------------------------------------------------------- */
function Starfield() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    let stars = []
    let shots = []
    let shotTimer
    const mouse = { x: 0, y: 0 }

    const build = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * DPR
      canvas.height = h * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      const count = Math.min(260, Math.round((w * h) / 9000))
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.3,
        depth: Math.random() * 0.8 + 0.2,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.03 + 0.008,
      }))
    }
    build()

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const s of stars) {
        if (!PREFERS_REDUCED_MOTION) s.tw += s.tws
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.tw))
        const px = s.x + mouse.x * s.depth * 0.02
        const py = s.y + mouse.y * s.depth * 0.02
        ctx.beginPath()
        ctx.arc(px, py, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(226, 232, 240, ${a})`
        ctx.fill()
      }
    }

    // Occasional shooting star: a streak from the upper area crossing the sky.
    const shoot = () => {
      shots.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.5,
        vx: 4 + Math.random() * 3,
        vy: 2 + Math.random() * 2,
        life: 1,
      })
      shotTimer = setTimeout(shoot, 3500 + Math.random() * 5000)
    }

    const drawShots = () => {
      shots = shots.filter((o) => o.life > 0)
      for (const o of shots) {
        o.x += o.vx
        o.y += o.vy
        o.life -= 0.012
        const tailX = o.x - o.vx * 6
        const tailY = o.y - o.vy * 6
        const g = ctx.createLinearGradient(o.x, o.y, tailX, tailY)
        g.addColorStop(0, `rgba(255, 255, 255, ${o.life})`)
        g.addColorStop(1, 'rgba(120, 160, 255, 0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(o.x, o.y)
        ctx.lineTo(tailX, tailY)
        ctx.stroke()
      }
    }

    let raf
    const loop = () => {
      draw()
      drawShots()
      raf = requestAnimationFrame(loop)
    }
    if (PREFERS_REDUCED_MOTION) {
      draw()
    } else {
      raf = requestAnimationFrame(loop)
      shotTimer = setTimeout(shoot, 1800)
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left - w / 2
      mouse.y = e.clientY - r.top - h / 2
    }
    window.addEventListener('resize', build)
    window.addEventListener('mousemove', onMove)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(shotTimer)
      window.removeEventListener('resize', build)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
}

/* ----------------------------------------------------------------------------
   Cursor spotlight — a soft light that eases toward the pointer.
---------------------------------------------------------------------------- */
function CursorGlow() {
  const ref = useRef(null)
  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) return
    const el = ref.current
    let x = window.innerWidth / 2
    let y = window.innerHeight / 2
    let tx = x
    let ty = y
    let raf
    const onMove = (e) => {
      tx = e.clientX
      ty = e.clientY
    }
    const frame = () => {
      x += (tx - x) * 0.12
      y += (ty - y) * 0.12
      el.style.transform = `translate3d(${(x - 170).toFixed(1)}px, ${(y - 170).toFixed(1)}px, 0)`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    window.addEventListener('mousemove', onMove)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0"
      style={{
        width: 340,
        height: 340,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgb(var(--p500) / 0.12), transparent 60%)',
      }}
    />
  )
}

// Scattered around the edges, leaving the middle clear for the sign-in card.
// A minimum-distance check keeps them from clumping into a cluster.
// Module scope keeps the randomness out of React's render phase.
function generateDumbbells() {
  const items = []
  const MIN_DIST = 15 // in viewport-% units — no two dumbbells closer than this
  let tries = 0
  while (items.length < 15 && tries < 2000) {
    tries++
    const left = Math.random() * 100
    const top = Math.random() * 100
    if (left > 27 && left < 73 && top > 20 && top < 80) continue
    // Reject if it lands too close to one already placed.
    const tooClose = items.some(
      (p) => Math.hypot(p.left - left, p.top - top) < MIN_DIST,
    )
    if (tooClose) continue
    const depth = 0.35 + Math.random() * 0.8 // far → near
    items.push({
      id: items.length,
      left,
      top,
      size: Math.round(24 + depth * 46),
      depth,
      dir: Math.random() > 0.5 ? 1 : -1,
    })
  }
  return items
}

/* Zero-gravity dumbbells. Each is four nested layers so their transforms never
   fight: cell = mouse repel (rAF), pop = warp-in + click rep (anime), orbit =
   ambient drift (anime loop), icon = slow spin (anime loop). */
function DumbbellField() {
  const fieldRef = useRef(null)
  // Lazy initialiser: generated once, and never re-randomised on re-render.
  const [dumbbells] = useState(generateDumbbells)

  useEffect(() => {
    if (!dumbbells.length) return
    const field = fieldRef.current
    if (!field) return
    const cells = Array.from(field.querySelectorAll('.db-cell'))

    if (PREFERS_REDUCED_MOTION) {
      cells.forEach((c) => { c.style.opacity = '1' })
      return
    }

    // --- Entrance: warp in from tiny, staggered ---
    anime({ targets: cells, opacity: [0, 1], duration: 700, delay: anime.stagger(35), easing: 'easeOutQuad' })
    anime({
      targets: cells.map((c) => c.querySelector('.db-pop')),
      scale: [0.2, 1],
      duration: 950,
      delay: anime.stagger(35),
      easing: 'easeOutBack',
    })

    // --- Ambient motion: drift + spin, each on its own layer and clock ---
    cells.forEach((cell) => {
      const orbit = cell.querySelector('.db-orbit')
      const icon = cell.querySelector('.db-icon')
      const dir = Number(cell.dataset.dir) || 1
      anime({
        targets: orbit,
        translateX: [anime.random(-16, 16), anime.random(-34, 34)],
        translateY: [anime.random(-16, 16), anime.random(-34, 34)],
        duration: anime.random(7000, 13000),
        easing: 'easeInOutSine',
        direction: 'alternate',
        loop: true,
        delay: anime.random(0, 4000),
      })
      anime({
        targets: icon,
        rotate: 360 * dir,
        duration: anime.random(18000, 42000),
        easing: 'linear',
        loop: true,
      })
    })

    // --- Interaction: cursor pushes nearby dumbbells away, spring back ---
    const state = cells.map((el) => ({ el, cx: 0, cy: 0, tx: 0, ty: 0 }))
    const measure = () => {
      state.forEach((c) => {
        const r = c.el.getBoundingClientRect()
        c.cx = r.left + r.width / 2 - c.tx
        c.cy = r.top + r.height / 2 - c.ty
      })
    }
    measure()

    const mouse = { x: -9999, y: -9999 }
    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const RADIUS = 190
    let raf
    const frame = () => {
      state.forEach((c) => {
        const dx = c.cx - mouse.x
        const dy = c.cy - mouse.y
        const dist = Math.hypot(dx, dy)
        let goX = 0
        let goY = 0
        if (dist < RADIUS) {
          const depth = Number(c.el.dataset.depth) || 0.6
          const force = (1 - dist / RADIUS) ** 2 * 110 * depth
          const inv = dist || 1
          goX = (dx / inv) * force
          goY = (dy / inv) * force
        }
        c.tx += (goX - c.tx) * 0.12
        c.ty += (goY - c.ty) * 0.12
        c.el.style.transform = `translate3d(${c.tx.toFixed(1)}px, ${c.ty.toFixed(1)}px, 0)`
      })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('resize', measure)
      cells.forEach((cell) => {
        anime.remove(cell)
        anime.remove(cell.querySelector('.db-orbit'))
        anime.remove(cell.querySelector('.db-icon'))
        anime.remove(cell.querySelector('.db-pop'))
      })
    }
  }, [dumbbells])

  // Click = a satisfying "rep": the dumbbell lifts up and settles back.
  const doRep = (e) => {
    if (PREFERS_REDUCED_MOTION) return
    const pop = e.currentTarget.querySelector('.db-pop')
    anime.remove(pop)
    anime({
      targets: pop,
      translateY: [0, -20, 0],
      scale: [1, 1.14, 1],
      rotate: [0, -7, 7, 0],
      duration: 950,
      easing: 'easeOutElastic(1, .55)',
    })
  }

  return (
    <div ref={fieldRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {dumbbells.map((d) => (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          key={d.id}
          onClick={doRep}
          data-depth={d.depth}
          data-dir={d.dir}
          className="db-cell pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 focus:outline-none"
          style={{ left: `${d.left}%`, top: `${d.top}%`, opacity: 0, transform: 'translate3d(0,0,0)' }}
        >
          <span className="db-pop block" style={{ transform: 'translateZ(0)' }}>
            <span className="db-orbit block">
              <Dumbbell
                className="db-icon block text-primary-300"
                size={d.size}
                strokeWidth={1.4}
                style={{
                  opacity: 0.12 + d.depth * 0.5,
                  filter: `drop-shadow(0 0 ${9 * d.depth}px rgb(var(--p400) / ${0.28 * d.depth})) blur(${((1 - d.depth) * 1.4).toFixed(2)}px)`,
                }}
              />
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

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

  // A water-drop ripple wherever the user taps: a central splash plus a few
  // concentric rings, each larger, slower, and slightly later than the last.
  const spawnRipple = (e) => {
    const layer = rippleRef.current
    if (!layer) return
    // Don't ripple over the sign-in card itself — only across the open space.
    if (cardRef.current && cardRef.current.contains(e.target)) return
    const rect = layer.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const base = 170

    const splash = document.createElement('span')
    splash.className = 'ripple-splash'
    splash.style.width = splash.style.height = `${base * 0.4}px`
    splash.style.left = `${x}px`
    splash.style.top = `${y}px`
    layer.appendChild(splash)
    setTimeout(() => splash.remove(), 520)

    const count = PREFERS_REDUCED_MOTION ? 1 : 3
    for (let i = 0; i < count; i++) {
      const ring = document.createElement('span')
      ring.className = 'ripple-ring'
      const size = base * (0.55 + i * 0.3)
      const dur = 0.8 + i * 0.28
      ring.style.width = ring.style.height = `${size}px`
      ring.style.left = `${x}px`
      ring.style.top = `${y}px`
      ring.style.setProperty('--dur', `${dur}s`)
      ring.style.animationDelay = `${i * 0.12}s`
      layer.appendChild(ring)
      setTimeout(() => ring.remove(), (dur + i * 0.12) * 1000 + 120)
    }
  }

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
      onPointerDown={spawnRipple}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition z-10"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2 relative overflow-hidden group"
            >
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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
            className="text-primary-300 hover:text-primary-200 underline underline-offset-2 transition"
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
