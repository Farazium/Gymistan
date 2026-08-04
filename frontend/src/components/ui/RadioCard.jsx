/**
 * A filled-dot choice that reads as a card. Used wherever a form has an either/or
 * that must be visible at a glance — a <select> would hide the second option
 * behind a click, and these decisions (full vs partial payment) are ones the
 * person at the desk needs to see both sides of before choosing.
 */
export default function RadioCard({ checked, onChange, label, hint, accent = 'primary', ...input }) {
  const ring = checked
    ? (accent === 'yellow' ? 'border-yellow-500/60 bg-yellow-500/10' : 'border-primary-500/60 bg-primary-500/10')
    : 'border-gray-600 hover:border-gray-500'
  const dot = accent === 'yellow' ? 'accent-yellow-500' : 'accent-primary-500'
  return (
    <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer select-none transition ${ring}`}>
      <input type="radio" checked={checked} onChange={onChange} className={`w-4 h-4 ${dot}`} {...input} />
      <span className="min-w-0">
        <span className={`block text-sm ${checked ? 'text-gray-100' : 'text-gray-300'}`}>{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  )
}
