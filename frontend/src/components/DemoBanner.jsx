/* The strip that sits above every page while a demo is running. It has to be
   unmissable — a visitor must never mistake the sample gym for their own data —
   without being in the way of the tour. */
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FlaskConical, RotateCcw, X } from 'lucide-react'
import { exitDemo } from '../demo'
import { resetData } from '../demo/api'
import toast from 'react-hot-toast'

export default function DemoBanner() {
  const qc = useQueryClient()
  const [resetting, setResetting] = useState(false)

  const reset = () => {
    setResetting(true)
    resetData()
    qc.clear()
    toast.success('Sample data restored')
    setTimeout(() => setResetting(false), 400)
  }

  return (
    <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-500/25 bg-primary-500/10 px-4 py-2 backdrop-blur-md">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-200">
        <FlaskConical size={15} />
        Demo mode
      </span>
      <span className="text-xs text-gray-300">
        Sample gym, sample data. Everything works — add members, take payments, run
        the reports — and nothing is saved once you close the tab.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={reset}
          disabled={resetting}
          className="btn-secondary !px-3 !py-1 text-xs"
        >
          <RotateCcw size={13} className={resetting ? 'animate-spin' : ''} />
          Reset data
        </button>
        <button onClick={exitDemo} className="btn-primary !px-3 !py-1 text-xs">
          <X size={13} />
          Exit demo
        </button>
      </div>
    </div>
  )
}
