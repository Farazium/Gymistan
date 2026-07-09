import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Instagram-style photo lightbox: a circular enlarged photo on a dimmed,
// blurred backdrop (matching the app modals). Smooth fade + scale on open/close.
export default function PhotoViewer({ src, alt = '', onClose }) {
  const [show, setShow] = useState(false)

  // Trigger the enter transition on mount. Double rAF so the browser paints the
  // hidden state once before flipping to visible, otherwise the fade-in is skipped.
  useEffect(() => {
    let inner
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setShow(true)) })
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
  }, [])

  // Play the exit transition, then unmount.
  const close = () => {
    setShow(false)
    setTimeout(onClose, 200)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!src) return null

  // Render into <body> so the fixed overlay covers the whole viewport — otherwise
  // an ancestor with transform/overflow clips it and the top bar never blurs.
  return createPortal(
    <div
      onClick={close}
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0'}`}
    >
      <button
        onClick={close}
        className={`absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all duration-200 ${show ? 'opacity-100' : 'opacity-0'}`}
      >
        <X size={22} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className={`w-72 h-72 sm:w-80 sm:h-80 max-w-[80vw] max-h-[80vw] rounded-full object-cover shadow-2xl ring-4 ring-white/10 transition-all duration-200 ease-out ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      />
    </div>,
    document.body
  )
}
