/* /demo — the door into the sample gym.

   Signs the visitor in as the demo gym's owner, flips the demo flag, then does a
   real page load into /dashboard so api/axios.js picks up the demo adapter before
   anything mounts. The short "spinning up" beat is not filler: it's the moment
   the reload happens, dressed to match the sign-in screen. */
import { useEffect, useRef, useState } from 'react'
import { Dumbbell, Loader2 } from 'lucide-react'
import { Starfield, CursorGlow } from '../../components/space/Scene'
import { BRAND_ACCENT } from '../../components/space/effects'
import useAuthStore from '../../store/authStore'
import { markDemo } from '../../demo'
import { DEMO_USER } from '../../demo/data'

const STEPS = [
  'Opening Iron Republic Gym…',
  'Loading 182 members and 6 trainers…',
  'Posting six months of payments…',
  'Waking the attendance device…',
]

export default function DemoBoot() {
  const { startDemo } = useAuthStore()
  const [step, setStep] = useState(0)
  const gone = useRef(false)

  useEffect(() => {
    markDemo()
    startDemo(DEMO_USER)
    const timers = STEPS.map((_, i) => setTimeout(() => setStep(i), i * 260))
    const jump = setTimeout(() => {
      if (gone.current) return
      gone.current = true
      window.location.replace('/dashboard')
    }, STEPS.length * 260 + 340)
    return () => { timers.forEach(clearTimeout); clearTimeout(jump) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 p-4"
      style={BRAND_ACCENT}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      <Starfield />
      <CursorGlow />

      <div className="relative text-center">
        <div className="relative inline-flex mb-6">
          <div className="absolute inset-0 rounded-2xl bg-primary-500/40 blur-xl animate-pulse" />
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-600/30 ring-1 ring-white/10">
            <Dumbbell size={30} className="text-white" strokeWidth={2} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Setting up your demo gym</h1>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-primary-200/80">
          <Loader2 size={14} className="animate-spin" />
          {STEPS[step]}
        </p>
        <div className="mx-auto mt-6 h-1 w-56 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
