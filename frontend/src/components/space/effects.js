/* Non-component pieces of the shared deep-space scene: the motion preference
   flag and the brand accent both public screens pin on their root. Kept out of
   Scene.jsx so that file exports only components (React Fast Refresh needs that
   separation). */

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
