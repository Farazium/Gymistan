import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES } from '../../utils/pagination'

// Rows-per-page + page stepper, sitting above the long tables so it is in reach
// without scrolling a few hundred rows first. The state behind it lives in
// utils/pagination.js :: usePageState.
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const all = pageSize === 'all'
  const pages = all ? 1 : Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : all ? 1 : (page - 1) * pageSize + 1
  const last = all ? total : Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-700/60">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Rows per page</span>
        <select
          className="input w-auto py-1 text-xs"
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={String(s)}>{s === 'all' ? 'All' : s}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 tabular-nums">{first}–{last} of {total}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={all || page <= 1}
            title="Previous page"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-gray-400 tabular-nums px-1">{all ? 1 : page} / {pages}</span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={all || page >= pages}
            title="Next page"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
