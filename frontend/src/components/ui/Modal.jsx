import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const [render, setRender] = useState(isOpen)
  const [show, setShow] = useState(false)

  // Keep the modal mounted through its exit animation, then unmount.
  useEffect(() => {
    if (isOpen) {
      // Mount immediately so the panel exists before the enter transition plays.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRender(true)
      // Double rAF: let the browser paint the initial (hidden) state once before
      // flipping to visible, otherwise the enter transition is skipped.
      let inner
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShow(true)) })
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
    }
    setShow(false)
    const t = setTimeout(() => setRender(false), 200)
    return () => clearTimeout(t)
  }, [isOpen])

  if (!render) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative surface rounded-xl shadow-xl w-full ${sizes[size]} max-h-[90vh] flex flex-col border border-gray-700 transition-all duration-200 ease-out ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-200 transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  )
}
