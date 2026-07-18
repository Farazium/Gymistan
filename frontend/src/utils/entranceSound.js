// Synthesised entrance sounds for the Live attendance screen — no audio files.
// A shared AudioContext, created on a user gesture (the Live toggle), so the
// browser lets it play.

let ctx = null

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) ctx = new AC()
  }
  if (ctx && ctx.state === 'suspended') ctx.resume()
  return ctx
}

function beep(freq, type, start, dur, peak) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(ctx.destination)
  const t = ctx.currentTime + start
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

// Active member: a bright two-note "ting" that rises.
export function playTing() {
  if (!initAudio()) return
  beep(880, 'sine', 0, 0.18, 0.5)
  beep(1320, 'sine', 0.11, 0.22, 0.5)
}

// Expired / unknown: a low, harsh double buzz.
export function playBuzzer() {
  if (!initAudio()) return
  beep(140, 'square', 0, 0.22, 0.35)
  beep(140, 'square', 0.28, 0.28, 0.35)
}

export function playForStatus(status) {
  if (status === 'active' || status === 'trainer') playTing()
  else playBuzzer() // expired or unknown
}
