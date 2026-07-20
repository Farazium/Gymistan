import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'
import toast from 'react-hot-toast'

// Circular crop dialog. The circle stays frozen; the image is dragged (pan) and
// zoomed underneath it. On confirm we draw the visible square region to a canvas
// and hand back a File — matching how the photo is shown everywhere (rounded-full,
// object-cover), so a square export whose inscribed circle is visible is exact.
const FRAME = 288      // on-screen crop square (px); circle is inscribed
const OUTPUT = 512     // exported image size (px)

export default function PhotoCropper({ file, onCancel, onCropped }) {
  const [src, setSrc] = useState('')
  const [img, setImg] = useState(null)          // loaded HTMLImageElement
  const [base, setBase] = useState(1)           // cover baseline scale
  const [zoom, setZoom] = useState(1)           // user zoom multiplier (>= 1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // top-left of image within frame
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const drag = useRef(null)

  // Read the chosen file into an <img> and compute the cover baseline.
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSrc(url)
    const image = new Image()
    image.onload = () => {
      const b = Math.max(FRAME / image.width, FRAME / image.height)
      setImg(image)
      setBase(b)
      setZoom(1)
      const w = image.width * b, h = image.height * b
      setPos({ x: (FRAME - w) / 2, y: (FRAME - h) / 2 })
    }
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const outer = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)))
    return () => cancelAnimationFrame(outer)
  }, [])

  const close = () => { setShow(false); setTimeout(onCancel, 200) }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the image covering the frame at all times (no gaps at the edges).
  const clamp = useCallback((p, z) => {
    if (!img) return p
    const w = img.width * base * z, h = img.height * base * z
    return {
      x: Math.min(0, Math.max(FRAME - w, p.x)),
      y: Math.min(0, Math.max(FRAME - h, p.y)),
    }
  }, [img, base])

  // Zoom about the frame centre so the focus point stays put.
  const applyZoom = useCallback((nextZoom) => {
    const z = Math.min(4, Math.max(1, nextZoom))
    setZoom((prevZoom) => {
      setPos((p) => {
        const c = FRAME / 2
        const ratio = z / prevZoom
        return clamp({ x: c - (c - p.x) * ratio, y: c - (c - p.y) * ratio }, z)
      })
      return z
    })
  }, [clamp])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY }
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    drag.current = { px: e.clientX, py: e.clientY }
    setPos((p) => clamp({ x: p.x + dx, y: p.y + dy }, zoom))
  }
  const onPointerUp = () => { drag.current = null }
  const onWheel = (e) => { applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.92)) }

  const confirm = () => {
    if (!img || busy) return
    setBusy(true)
    const scale = base * zoom
    const perPx = 1 / scale // displayed px -> source px
    const sx = -pos.x * perPx
    const sy = -pos.y * perPx
    const sSize = FRAME * perPx

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT; canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#111827' // corners never show (circular display), but keep clean
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT)

    canvas.toBlob((blob) => {
      if (!blob) { setBusy(false); toast.error('Could not process image'); return }
      const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
      const out = new File([blob], name, { type: 'image/jpeg' })
      setShow(false)
      setTimeout(() => onCropped(out), 180)
    }, 'image/jpeg', 0.9)
  }

  return createPortal(
    <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${show ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`relative surface rounded-2xl shadow-2xl border border-gray-700 p-6 w-full max-w-sm transition-all duration-200 ease-out ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-100">Adjust photo</h2>
          <button onClick={close} className="p-1 rounded-lg text-gray-400 hover:text-gray-200 transition [--btn-fill:55_65_81] [--btn-edge:31_41_55]">
            <X size={18} />
          </button>
        </div>

        {/* Crop stage: image pans under a frozen circular mask */}
        <div
          className="relative mx-auto overflow-hidden rounded-lg bg-gray-900 select-none touch-none cursor-grab active:cursor-grabbing"
          style={{ width: FRAME, height: FRAME, maxWidth: '100%' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          {src && img && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={{
                width: img.width * base * zoom,
                height: img.height * base * zoom,
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
            />
          )}
          {/* Dim everything outside the circle; ring shows the frozen crop edge */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)', borderRadius: '50%' }}
          />
          <div className="absolute inset-0 pointer-events-none rounded-full ring-2 ring-white/70" />
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-3 mt-5">
          <button onClick={() => applyZoom(zoom - 0.2)} className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-primary-500/20 transition" title="Zoom out">
            <ZoomOut size={18} />
          </button>
          <input
            type="range" min="1" max="4" step="0.01" value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="flex-1 accent-primary-500"
          />
          <button onClick={() => applyZoom(zoom + 0.2)} className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-primary-500/20 transition" title="Zoom in">
            <ZoomIn size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">Drag to reposition · scroll or slider to zoom</p>

        <div className="flex gap-3 mt-5">
          <button onClick={close} className="btn flex-1 justify-center bg-red-500/20 text-red-300 border border-red-500/30 hover:text-white hover:border-red-500 hover:shadow-lg hover:shadow-red-500/20 backdrop-blur-sm transition-all [--btn-fill:239_68_68] [--btn-edge:185_28_28]">Cancel</button>
          <button onClick={confirm} disabled={busy || !img} className="btn-primary flex-1 justify-center">
            <Check size={16} /> {busy ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
