import { useRef, useEffect } from 'react'

// The sign-in screen's animated backdrop, extracted so the app background can
// reuse the exact same look. A dark space ground with a canvas of twinkling
// stars that drift with the cursor and the odd shooting star.

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Twinkling starfield on a canvas (a few hundred points stay cheap).
export function Starfield() {
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

// Full-bleed animated background: the space ground plus the starfield. A faint
// accent glow ties it to the gym's theme colour.
export default function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% -10%, rgb(var(--p500) / 0.12), transparent 60%)' }}
      />
      <Starfield />
    </div>
  )
}
