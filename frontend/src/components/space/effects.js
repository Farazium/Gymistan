/* Non-component pieces of the shared deep-space scene: the motion preference
   flag, the brand accent both public screens pin on their root, and the
   water-drop click ripple. Kept out of Scene.jsx so that file exports only
   components (React Fast Refresh needs that separation).

   All of this was lifted out of pages/auth/Login.jsx unchanged; Login now
   imports it rather than owning it. */

export const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The public screens are universal — they must not inherit the last gym's accent
// that theme.js left on :root. Pin the brand default (Blue) on the page's own
// root so every primary/accent token underneath resolves to it, whatever theme
// is stored.
export const BRAND_ACCENT = {
  '--p200': '191 219 254',
  '--p300': '147 197 253',
  '--p400': '96 165 250',
  '--p500': '59 130 246',
  '--p600': '37 99 235',
  '--p700': '29 78 216',
  '--surface': '31 41 55',
}

/* A water-drop ripple wherever the user taps: a central splash plus a few
   concentric rings, each larger, slower, and slightly later than the last.
   `layer` is the .ripple-layer element the nodes are appended to; `skip` is an
   optional predicate that vetoes the ripple (e.g. over the sign-in card). */
export function spawnRipple(e, layer, skip) {
  if (!layer) return
  if (skip && skip(e.target)) return
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
