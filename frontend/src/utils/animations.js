// The per-account "Animations" switch (Settings › Customization). A gym running
// on an old laptop can turn the app's motion off: the starfield background, the
// sidebar shimmer, the page fade-in, and the accent disc that blooms out of the
// cursor on every button hover.
//
// Stored per user id in localStorage, and only ever applied inside the signed-in
// app — one account switching motion off must not change what their colleagues
// see, nor what a visitor meets on the marketing page.

const key = (userId) => `anim_on_${userId ?? 'anon'}`

// Motion is off while <html> carries this class. index.css hangs every opt-out
// rule off it, and the canvas backdrop checks it before starting a frame loop.
export const OFF_CLASS = 'no-anim'

// On unless this account has explicitly switched it off.
export function animationsEnabled(userId) {
  return localStorage.getItem(key(userId)) !== '0'
}

export function setAnimationsEnabled(userId, on) {
  localStorage.setItem(key(userId), on ? '1' : '0')
  applyAnimations(userId)
}

export function applyAnimations(userId) {
  document.documentElement.classList.toggle(OFF_CLASS, !animationsEnabled(userId))
}

// Signing out leaves the app layout — the public pages keep their own motion.
export function clearAnimations() {
  document.documentElement.classList.remove(OFF_CLASS)
}

// Live read, for components that must skip the work rather than just paint
// differently (a requestAnimationFrame loop can't be turned off by CSS).
export function animationsOn() {
  return !document.documentElement.classList.contains(OFF_CLASS)
}
