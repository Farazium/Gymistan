import { ChevronDown } from 'lucide-react'

// One foldable month of a grouped ledger. The header has to stand on its own
// when the section is shut, so it carries the month, how many rows are inside,
// and the month's total — a closed year of history still reads as a summary.
export default function MonthSection({ label, count, total, totalClass = 'text-gray-200', open, onToggle, children }) {
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="no-fx group w-full flex items-center justify-between gap-3 px-1 pt-4 pb-2 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown
            size={18}
            className={`shrink-0 text-gray-500 group-hover:text-primary-400 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="text-lg font-bold text-gray-200 truncate group-hover:text-primary-300 transition-colors">{label}</span>
          <span className="text-xs text-gray-500 shrink-0">{count}</span>
        </span>
        <span className={`text-sm font-semibold shrink-0 ${totalClass}`}>{total}</span>
      </button>
      {open && children}
    </div>
  )
}
