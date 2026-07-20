import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Fingerprint, CheckCircle2, XCircle, Loader2, Trash2, RotateCcw } from 'lucide-react'
import api from '../api/axios'
import Modal from './ui/Modal'
import toast from 'react-hot-toast'

// Fingerprint panel: shows whether a member is enrolled, and lets you enroll,
// re-enroll (replace), or remove. Enrollment runs on the device and is polled;
// remove is a quick device call. `autoStart` jumps straight into enrollment
// (used right after adding a member).
export default function EnrollModal({ member, isOpen, onClose, autoStart = false, kind = 'member' }) {
  const qc = useQueryClient()
  const [state, setState] = useState(autoStart ? 'starting' : 'checking') // checking|idle|starting|running|done|removing|removed|failed
  const [enrolled, setEnrolled] = useState(!!member?.has_fingerprint)
  const [message, setMessage] = useState('')
  const pollRef = useRef(null)

  // Reset to a clean state each time the modal opens. Tracking the previous
  // isOpen in state and adjusting during render (React's sanctioned pattern for
  // "reset state when a prop changes") lets the parent keep this mounted across
  // close — which is what allows the Modal's exit animation to play instead of
  // the panel vanishing instantly.
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setState(autoStart ? 'starting' : 'checking')
      setMessage('')
      setEnrolled(!!member?.has_fingerprint)
    }
  }

  const refreshMember = () => {
    qc.invalidateQueries({ queryKey: [kind] })          // 'member' or 'trainer'
    qc.invalidateQueries({ queryKey: [`${kind}s`] })    // 'members' or 'trainers'
  }

  const handleClose = () => {
    clearInterval(pollRef.current)
    // If an enrollment is still waiting on the device, cancel it so it doesn't
    // keep running (and block the next one) while the device stays in enroll mode.
    if (state === 'starting' || state === 'running') {
      api.patch('/attendance/device/enroll/').catch(() => {})
    }
    setState('idle')
    setMessage('')
    onClose()
  }

  const poll = async () => {
    try {
      const { data } = await api.get('/attendance/device/enroll/')
      if (data.message) setMessage(data.message)
      if (data.state === 'done') {
        clearInterval(pollRef.current)
        setState('done')
        setEnrolled(true)
        refreshMember()
        toast.success('Fingerprint enrolled')
      } else if (data.state === 'failed') {
        clearInterval(pollRef.current)
        setState('failed')
      }
    } catch {
      /* keep polling */
    }
  }

  const start = async () => {
    setState('starting')
    try {
      const { data } = await api.post('/attendance/device/enroll/', { type: kind, id: member.id, finger: 0 })
      if (!data.started) {
        setState('failed')
        setMessage(data.message || 'Could not start')
        return
      }
      setState('running')
      setMessage(data.message || 'Place finger on the sensor 3 times…')
      clearInterval(pollRef.current)
      pollRef.current = setInterval(poll, 1500)
    } catch (e) {
      setState('failed')
      setMessage(e.response?.data?.message || 'Could not start enrollment')
    }
  }

  const remove = async () => {
    setState('removing')
    try {
      await api.delete('/attendance/device/enroll/', { data: { type: kind, id: member.id } })
      setState('removed')
      setEnrolled(false)
      refreshMember()
      toast.success('Fingerprint removed')
    } catch (e) {
      setState('failed')
      setMessage(e.response?.data?.message || 'Could not remove fingerprint')
    }
  }

  // Stop polling on unmount.
  useEffect(() => () => clearInterval(pollRef.current), [])

  // On open: auto-start (add-member flow), or read the real status off the device.
  // Keyed on isOpen so it runs each time the modal opens (the parent may keep this
  // mounted while closed), and does nothing while closed — so a closed panel never
  // fires a device fingerprint check.
  useEffect(() => {
    if (!isOpen) return
    if (autoStart) {
      const t = setTimeout(start, 60)
      return () => clearTimeout(t)
    }
    let alive = true
    ;(async () => {
      try {
        const { data } = await api.get('/attendance/device/fingerprint/', { params: { type: kind, id: member.id } })
        if (alive) { setEnrolled(!!data.enrolled); setState('idle') }
      } catch {
        if (alive) setState('idle')
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const Icon = state === 'done' || state === 'removed' ? CheckCircle2
    : state === 'failed' ? XCircle
    : Fingerprint
  const iconColor = state === 'done' || state === 'removed' ? 'text-green-400'
    : state === 'failed' ? 'text-red-400'
    : state === 'running' || state === 'starting' || state === 'removing' ? 'text-primary-400 animate-pulse'
    : enrolled ? 'text-green-400' : 'text-gray-500'

  const busy = ['starting', 'running', 'removing'].includes(state)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Fingerprint" size="sm">
      <div className="text-center py-3">
        <Icon size={54} className={`mx-auto ${iconColor}`} />
        <p className="mt-4 text-gray-100 font-medium">{member?.name}</p>

        {state === 'checking' && (
          <p className="mt-3 text-sm text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Checking fingerprint…
          </p>
        )}
        {state === 'idle' && enrolled && (
          <>
            <p className="mt-1 text-sm text-green-400">Fingerprint is enrolled.</p>
            <div className="flex justify-center gap-2 mt-5">
              <button onClick={start} className="btn-primary"><RotateCcw size={15} /> Re-enroll</button>
              <button onClick={remove} className="btn-danger"><Trash2 size={15} /> Remove</button>
            </div>
          </>
        )}
        {state === 'idle' && !enrolled && (
          <>
            <p className="mt-1 text-sm text-gray-400">
              No fingerprint yet. The device will ask {member?.name?.split(' ')[0] || 'them'} to place their finger 3 times.
            </p>
            <div className="flex justify-center mt-5">
              <button onClick={start} className="btn-primary"><Fingerprint size={16} /> Start enrollment</button>
            </div>
          </>
        )}

        {state === 'starting' && (
          <p className="mt-3 text-sm text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Starting…
          </p>
        )}
        {state === 'running' && (
          <p className="mt-3 text-sm text-primary-300">{message || 'Place finger on the sensor 3 times…'}</p>
        )}
        {state === 'removing' && (
          <p className="mt-3 text-sm text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> Removing…
          </p>
        )}
        {state === 'done' && <p className="mt-3 text-sm text-green-400">Fingerprint enrolled successfully.</p>}
        {state === 'removed' && <p className="mt-3 text-sm text-green-400">Fingerprint removed.</p>}
        {state === 'failed' && (
          <>
            <p className="mt-3 text-sm text-red-400">{message || 'Something went wrong.'}</p>
            <div className="flex justify-center mt-4">
              <button onClick={start} className="btn-secondary">Try again</button>
            </div>
          </>
        )}

        {!busy && (state === 'done' || state === 'removed') && (
          <div className="flex justify-center mt-5">
            <button onClick={handleClose} className="btn-primary">Done</button>
          </div>
        )}
      </div>
    </Modal>
  )
}
