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

// A richer voice than beep(): supports a pitch glide (freq as [from, to]), a
// lowpass sweep (cutoff as [from, to]) to round off harsh waveforms, and vibrato.
// Used by the "sad trombone" buzzer.
function tone({ freq, type = 'sine', start = 0, dur = 0.2, peak = 0.4, cutoff, vibrato }) {
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator()
  osc.type = type
  if (Array.isArray(freq)) {
    osc.frequency.setValueAtTime(freq[0], t)
    osc.frequency.exponentialRampToValueAtTime(freq[1], t + dur)
  } else {
    osc.frequency.setValueAtTime(freq, t)
  }
  let out = osc
  if (cutoff) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(cutoff[0], t)
    if (cutoff[1]) f.frequency.exponentialRampToValueAtTime(cutoff[1], t + dur)
    osc.connect(f)
    out = f
  }
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  out.connect(gain)
  gain.connect(ctx.destination)
  if (vibrato) {
    const lfo = ctx.createOscillator()
    const lg = ctx.createGain()
    lfo.frequency.value = vibrato.rate
    lg.gain.value = vibrato.depth
    lfo.connect(lg)
    lg.connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.05)
  }
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

// Active member: a bright two-note "ting" that rises.
export function playTing() {
  if (!initAudio()) return
  beep(880, 'sine', 0, 0.18, 0.5)
  beep(1320, 'sine', 0.11, 0.22, 0.5)
}

// Expired / unknown: a "sad trombone" — four sawtooth notes falling away, the
// last one sliding down, softened by a lowpass and a little vibrato.
export function playBuzzer() {
  if (!initAudio()) return
  const notes = [330, 294, 262, 196]
  notes.forEach((n, i) => {
    const last = i === notes.length - 1
    tone({
      freq: last ? [n, n * 0.82] : n,
      type: 'sawtooth',
      start: i * 0.2,
      dur: last ? 0.5 : 0.22,
      peak: 0.32,
      cutoff: [1400, 700],
      vibrato: { rate: 11, depth: 7 },
    })
  })
}

export function playForStatus(status) {
  if (status === 'active' || status === 'trainer') playTing()
  else playBuzzer() // expired or unknown
}
