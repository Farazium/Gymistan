/* The sign-in screen's deep-space scene, shared with the marketing landing page
   so both wear the same skin: a twinkling starfield and a field of zero-gravity
   dumbbells. The shared constants live next door in effects.js. */
import { useState, useRef, useEffect } from 'react'
import { Dumbbell } from 'lucide-react'
import anime from 'animejs/lib/anime.es.js'
import { PREFERS_REDUCED_MOTION } from './effects'

/* ----------------------------------------------------------------------------
   Starfield — a canvas of twinkling stars that drift a little with the cursor.
   Canvas (not DOM) so a few hundred points stay cheap.
---------------------------------------------------------------------------- */
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

// Scattered around the edges, leaving the middle clear for the sign-in card (or
// the landing hero's copy). A minimum-distance check keeps them from clumping
// into a cluster. Module scope keeps the randomness out of React's render phase.
function generateDumbbells(count, clearCenter) {
  const items = []
  const MIN_DIST = 15 // in viewport-% units — no two dumbbells closer than this
  let tries = 0
  while (items.length < count && tries < 2000) {
    tries++
    const left = Math.random() * 100
    const top = Math.random() * 100
    if (clearCenter && left > 27 && left < 73 && top > 20 && top < 80) continue
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
export function DumbbellField({ count = 15, clearCenter = true }) {
  const fieldRef = useRef(null)
  // Lazy initialiser: generated once, and never re-randomised on re-render.
  const [dumbbells] = useState(() => generateDumbbells(count, clearCenter))

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
          className="no-fx db-cell pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 focus:outline-none"
          style={{ left: `${d.left}%`, top: `${d.top}%`, opacity: 0, transform: 'translate3d(0,0,0)' }}
        >
          <span className="db-pop block" style={{ transform: 'translateZ(0)' }}>
            <span className="db-orbit block">
              <Dumbbell
                className="db-icon block text-primary-300"
                size={d.size}
                strokeWidth={1.4}
                /* Faint on purpose — this is a backdrop the hero copy and the
                   sign-in card sit on top of, so it reads as texture rather
                   than as something competing for attention. */
                style={{
                  opacity: 0.08 + d.depth * 0.26,
                  filter: `drop-shadow(0 0 ${7 * d.depth}px rgb(var(--p400) / ${0.15 * d.depth})) blur(${((1 - d.depth) * 1.4).toFixed(2)}px)`,
                }}
              />
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
