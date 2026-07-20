import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, TrendingUp, PieChart, ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronRight, ChevronLeft, CalendarDays, Download, Loader2, ClipboardList, ChevronLeft as ChevLeft, ChevronRight as ChevRight } from 'lucide-react'
import api from '../../api/axios'
import useAuthStore from '../../store/authStore'
import { exportLedgerPDF, exportIncomeStatementPDF, exportExpenseCategoriesPDF, exportDailyCollectionPDF } from '../../utils/financePDF'
import { fmtCurrency as fmt } from '../../utils/format'


const localStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const today = new Date()
const todayStr = localStr(today)
const thisMonthStart = localStr(new Date(today.getFullYear(), today.getMonth(), 1))
const thisWeekStart = (() => {
  const d = new Date(today)
  const day = d.getDay() // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1 // Monday=0 offset
  d.setDate(d.getDate() - diff)
  return localStr(d)
})()
const thisYearStart = `${today.getFullYear()}-01-01`
const fiveYearsAgo = `${today.getFullYear() - 5}-01-01`

const PRESETS = [
  { label: 'Today', start: todayStr, end: todayStr },
  { label: 'This Week', start: thisWeekStart, end: todayStr },
  { label: 'This Month', start: thisMonthStart, end: todayStr },
  { label: 'This Year', start: thisYearStart, end: todayStr },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const YEARS = Array.from({ length: 6 }, (_, i) => today.getFullYear() - i)

const CAT_COLORS = {
  'Rent': 'bg-primary-500/20 text-primary-400',
  'Utilities': 'bg-yellow-500/20 text-yellow-400',
  'Salaries': 'bg-purple-500/20 text-purple-400',
  'Equipment': 'bg-orange-500/20 text-orange-400',
  'Maintenance': 'bg-cyan-500/20 text-cyan-400',
  'Marketing': 'bg-pink-500/20 text-pink-400',
  'Other': 'bg-gray-500/20 text-gray-400',
  'Admission Fee': 'bg-indigo-500/20 text-indigo-400',
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function formatDateDisplay(s) {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00')
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function makeDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function CustomCalendarPicker({ start, end, onStartChange, onEndChange }) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState('start')
  const [hovered, setHovered] = useState(null)
  const [viewYear, setViewYear] = useState(() => end ? new Date(end).getFullYear() : today.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => end ? new Date(end).getMonth() : today.getMonth())

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    const nextDate = new Date(viewYear, viewMonth + 1, 1)
    if (nextDate <= today) {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
      else setViewMonth(m => m + 1)
    }
  }

  const handleDay = (d) => {
    const ds = makeDateStr(viewYear, viewMonth, d)
    if (ds > todayStr) return
    if (picking === 'start') {
      onStartChange(ds)
      if (end && ds > end) onEndChange(ds)
      setPicking('end')
    } else {
      if (ds < start) { onStartChange(ds); setPicking('end') }
      else { onEndChange(ds); setOpen(false); setPicking('start') }
    }
  }

  const effectiveEnd = picking === 'end' && hovered ? hovered : end

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setPicking('start') }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
          open ? 'bg-primary-600/20 border-primary-500/50 text-primary-300' : 'bg-primary-500/10 border-primary-500/30 text-primary-300 hover:bg-primary-500/20'
        }`}
      >
        <CalendarDays size={13} />
        {formatDateDisplay(start)} — {formatDateDisplay(end)}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setPicking('start') }} />
          <div className="absolute top-full mt-2 left-0 z-50 surface border border-gray-700 rounded-2xl shadow-2xl p-4 w-72">

            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-primary-500/15 text-gray-400 hover:text-primary-300 transition">
                <ChevronLeft size={15} />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-100">{MONTH_NAMES[viewMonth]}</p>
                <p className="text-xs text-gray-500">{viewYear}</p>
              </div>
              <button
                onClick={nextMonth}
                disabled={new Date(viewYear, viewMonth + 1, 1) > today}
                className="p-1.5 rounded-lg hover:bg-primary-500/15 text-gray-400 hover:text-primary-300 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-[10px] text-gray-500 font-semibold py-1 tracking-wide">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                if (!d) return <div key={`e-${i}`} />
                const ds = makeDateStr(viewYear, viewMonth, d)
                const isStart = ds === start
                const isEnd = ds === end
                const inRange = effectiveEnd && ds > start && ds < effectiveEnd
                const isTodayDay = ds === todayStr
                const isFuture = ds > todayStr
                const isPast5 = ds < fiveYearsAgo
                const hasRange = effectiveEnd && start !== effectiveEnd

                return (
                  <div
                    key={d}
                    className={`relative flex items-center justify-center h-9 ${
                      (inRange || ((isStart || isEnd) && hasRange)) ? 'bg-primary-500' : ''
                    } ${isStart && hasRange ? 'rounded-l-full' : ''} ${isEnd && hasRange ? 'rounded-r-full' : ''}`}
                  >
                    <button
                      disabled={isFuture || isPast5}
                      onClick={() => handleDay(d)}
                      onMouseEnter={() => picking === 'end' && setHovered(ds)}
                      onMouseLeave={() => setHovered(null)}
                      className={`w-8 h-8 rounded-full text-xs font-medium transition-all
                        ${isFuture || isPast5 ? 'text-gray-700 cursor-not-allowed' : 'cursor-pointer'}
                        ${isStart || isEnd ? 'bg-primary-600 text-white font-bold' : ''}
                        ${inRange ? 'text-white font-semibold' : ''}
                        ${isTodayDay && !isStart && !isEnd && !inRange ? 'ring-1 ring-primary-400/60 text-primary-300' : ''}
                        ${!isStart && !isEnd && !inRange && !isFuture && !isPast5 ? 'text-gray-200 hover:bg-primary-500/30' : ''}
                      `}
                    >
                      {d}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-gray-700/60 flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-[11px] text-gray-500">
                  From <span className="text-primary-400 font-medium">{formatDateDisplay(start)}</span>
                </p>
                <p className="text-[11px] text-gray-500">
                  To <span className="text-primary-400 font-medium">{formatDateDisplay(end)}</span>
                </p>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <span className="text-[11px] text-gray-500">
                  {picking === 'start' ? '📍 Pick start date' : '📍 Pick end date'}
                </span>
                <button
                  onClick={() => { onStartChange(thisMonthStart); onEndChange(todayStr); setOpen(false); setPicking('start') }}
                  className="no-fx text-[11px] text-gray-500 hover:text-primary-400 transition"
                >
                  Reset to this month
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function DateRangeFilter({ start, end, onStartChange, onEndChange, activePreset, onPreset }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => onPreset(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activePreset === p.label
              ? 'bg-primary-600 text-white'
              : 'surface text-gray-400 hover:text-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => onPreset(null)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
          activePreset === null ? 'bg-primary-600 text-white' : 'surface text-gray-400 hover:text-gray-200'
        }`}
      >
        Custom
      </button>
      {activePreset === null && (
        <CustomCalendarPicker start={start} end={end} onStartChange={onStartChange} onEndChange={onEndChange} />
      )}
    </div>
  )
}

function PdfExportButton({ onExport }) {
  const [loading, setLoading] = useState(false)
  const handleExport = async () => {
    setLoading(true)
    try { await onExport() }
    finally { setLoading(false) }
  }
  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="p-2 rounded-lg bg-primary-500/20 text-primary-300 border border-primary-400/30 hover:text-white hover:border-primary-500 transition disabled:opacity-50"
      title="Export PDF"
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
    </button>
  )
}

function SummaryCard({ label, value, color }) {
  const colors = {
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    red: 'bg-red-500/10 border-red-500/20 text-red-400',
    blue: 'bg-primary-500/10 border-primary-500/20 text-primary-400',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

// ─── LEDGER TAB ───────────────────────────────────────────────────────────────
function LedgerTab() {
  const gymName = useAuthStore((s) => s.user?.gym_name)
  const [activePreset, setActivePreset] = useState('This Month')
  const [start, setStart] = useState(thisMonthStart)
  const [end, setEnd] = useState(todayStr)

  const handlePreset = (p) => {
    if (p) { setActivePreset(p.label); setStart(p.start); setEnd(p.end) }
    else setActivePreset(null)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['finance-ledger', start, end],
    queryFn: async () => { const { data } = await api.get('/dashboard/finance/ledger/', { params: { start, end } }); return data },
    enabled: !!start && !!end,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} activePreset={activePreset} onPreset={handlePreset} />
        {data && <PdfExportButton onExport={() => exportLedgerPDF(data, start, end, gymName)} />}
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total In" value={fmt(data.total_in)} color="green" />
          <SummaryCard label="Total Out" value={fmt(data.total_out)} color="red" />
          <SummaryCard label="Net" value={fmt(data.net)} color={data.net >= 0 ? 'blue' : 'red'} />
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">In</th>
                <th className="px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wide text-right">Out</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.length ? data.entries.map((e, i) => (
                <tr key={i} className="border-b border-gray-700/50 hover:bg-gray-700/20 transition">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(e.date).toLocaleDateString('en-PK')}
                  </td>
                  <td className="px-4 py-3 text-gray-100">{e.description}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      e.type === 'IN'
                        ? e.category === 'Inventory Sale' ? 'bg-cyan-500/20 text-cyan-400'
                        : e.category === 'Admission Fee' ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-green-500/20 text-green-400'
                        : CAT_COLORS[e.category] || CAT_COLORS['Other']
                    }`}>
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-400">
                    {e.type === 'IN' ? fmt(e.amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-400">
                    {e.type === 'OUT' ? fmt(e.amount) : '—'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-500">No transactions in this period</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── INCOME STATEMENT TAB ─────────────────────────────────────────────────────
function IncomeStatementTab() {
  const gymName = useAuthStore((s) => s.user?.gym_name)
  const [filterType, setFilterType] = useState('month')
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())

  const params = filterType === 'month' ? { month, year } : { year }

  const { data, isLoading } = useQuery({
    queryKey: ['finance-income', filterType, month, year],
    queryFn: async () => { const { data } = await api.get('/dashboard/finance/income-statement/', { params }); return data },
  })

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => setFilterType('month')}
            className={`px-4 py-1.5 text-xs font-medium transition ${filterType === 'month' ? 'bg-primary-600 text-white' : 'surface text-gray-400 hover:text-gray-200'}`}
          >
            By Month
          </button>
          <button
            onClick={() => setFilterType('year')}
            className={`px-4 py-1.5 text-xs font-medium transition ${filterType === 'year' ? 'bg-primary-600 text-white' : 'surface text-gray-400 hover:text-gray-200'}`}
          >
            By Year
          </button>
        </div>
        {filterType === 'month' && (
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input py-1.5 text-xs w-36">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        )}
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input py-1.5 text-xs w-28">
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {data && <PdfExportButton onExport={() => exportIncomeStatementPDF(data, gymName)} />}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Revenue" value={fmt(data.revenue.total)} color="green" />
            <SummaryCard label="Total Expenses" value={fmt(data.expenses.total)} color="red" />
            <SummaryCard label="Net Profit" value={fmt(data.net_profit)} color={data.net_profit >= 0 ? 'blue' : 'red'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue breakdown */}
            <div className="card p-5">
              <h3 className="font-semibold text-gray-100 mb-4 flex items-center gap-2">
                <ArrowDownCircle size={15} className="text-green-400" /> Revenue Breakdown
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-700">
                  <span className="text-sm text-gray-300">Member Fees</span>
                  <span className="font-semibold text-green-400">{fmt(data.revenue.member_fees)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-700">
                  <span className="text-sm text-gray-300">Inventory Sales</span>
                  <span className="font-semibold text-green-400">{fmt(data.revenue.inventory_sales)}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-semibold text-gray-100">Total Revenue</span>
                  <span className="font-bold text-green-400 text-base">{fmt(data.revenue.total)}</span>
                </div>
              </div>
            </div>

            {/* Expense breakdown */}
            <div className="card p-5">
              <h3 className="font-semibold text-gray-100 mb-4 flex items-center gap-2">
                <ArrowUpCircle size={15} className="text-red-400" /> Expense Breakdown
              </h3>
              {data.expenses.by_category.length ? (
                <div className="space-y-2">
                  {data.expenses.by_category.map(cat => (
                    <div key={cat.name} className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[cat.name] || CAT_COLORS['Other']}`}>{cat.name}</span>
                      <span className="font-medium text-red-400 text-sm">{fmt(cat.amount)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm font-semibold text-gray-100">Total Expenses</span>
                    <span className="font-bold text-red-400 text-base">{fmt(data.expenses.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-6">No expenses in this period</p>
              )}
            </div>
          </div>

          {/* Net Profit row */}
          <div className={`card p-5 border ${data.net_profit >= 0 ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Net Profit / Loss</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {data.period.start} — {data.period.end}
                </p>
              </div>
              <p className={`text-2xl font-bold ${data.net_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.net_profit >= 0 ? '+' : ''}{fmt(data.net_profit)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EXPENSE CATEGORIES TAB ───────────────────────────────────────────────────
function ExpenseCategoriesTab() {
  const gymName = useAuthStore((s) => s.user?.gym_name)
  const [activePreset, setActivePreset] = useState('This Month')
  const [start, setStart] = useState(thisMonthStart)
  const [end, setEnd] = useState(todayStr)
  const [expanded, setExpanded] = useState({})

  const handlePreset = (p) => {
    if (p) { setActivePreset(p.label); setStart(p.start); setEnd(p.end) }
    else setActivePreset(null)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['finance-expense-cats', start, end],
    queryFn: async () => { const { data } = await api.get('/dashboard/finance/expense-categories/', { params: { start, end } }); return data },
    enabled: !!start && !!end,
  })

  const toggle = (cat) => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <DateRangeFilter start={start} end={end} onStartChange={setStart} onEndChange={setEnd} activePreset={activePreset} onPreset={handlePreset} />
        {data && <PdfExportButton onExport={() => exportExpenseCategoriesPDF(data, start, end, gymName)} />}
      </div>

      <div className="space-y-4">
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total Expenses" value={fmt(data.total)} color="red" />
          <SummaryCard label="Categories" value={data.categories.length} color="blue" />
          <SummaryCard label="Period" value={`${new Date(start).toLocaleDateString('en-PK')} – ${new Date(end).toLocaleDateString('en-PK')}`} color="blue" />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : data?.categories.length ? (
        <div className="space-y-3">
          {data.categories.map(cat => (
            <div key={cat.category} className="card overflow-hidden">
              <button
                onClick={() => toggle(cat.category)}
                className="no-fx w-full flex items-center gap-4 p-4 hover:bg-gray-700/20 transition text-left"
              >
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${CAT_COLORS[cat.category] || CAT_COLORS['Other']}`}>
                  {cat.category}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-gray-300">{cat.count} expense{cat.count !== 1 ? 's' : ''}</span>
                    <span className="font-semibold text-red-400">{fmt(cat.total)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5">
                    <div className="bg-red-500/60 h-1.5 rounded-full" style={{ width: `${cat.pct}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{cat.pct}%</span>
                {expanded[cat.category] ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
              </button>

              {expanded[cat.category] && (
                <div className="border-t border-gray-700">
                  {cat.entries.map((e, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700/40 last:border-0 hover:bg-gray-700/10">
                      <div>
                        <p className="text-sm text-gray-200">{e.title}</p>
                        <p className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString('en-PK')}</p>
                      </div>
                      <span className="text-sm font-medium text-red-400">{fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-16 text-center text-gray-500">No expenses in this period</div>
      )}
      </div>
    </div>
  )
}


// ─── DAILY COLLECTION TAB ─────────────────────────────────────────────────────
function DailyCollectionTab() {
  const gymName = useAuthStore((s) => s.user?.gym_name)
  const [date, setDate] = useState(todayStr)

  const prevDay = () => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    if (localStr(d) >= fiveYearsAgo) setDate(localStr(d))
  }
  const nextDay = () => {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    if (localStr(d) <= todayStr) setDate(localStr(d))
  }

  const { data, isLoading } = useQuery({
    queryKey: ['finance-daily', date],
    queryFn: async () => { const { data } = await api.get('/dashboard/finance/daily-collection/', { params: { date } }); return data },
  })

  const Section = ({ title, color, items, cols, totalKey, emptyMsg }) => (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700" style={{ backgroundColor: 'rgb(var(--surface) / 0.4)' }}>
        <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
        {data && <span className={`text-sm font-bold ${color}`}>{fmt(data.totals[totalKey])}</span>}
      </div>
      {items?.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700/50">
              {cols.map(c => <th key={c.key} className={`px-4 py-2 text-xs text-gray-500 font-medium uppercase tracking-wide ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((row, i) => (
              <tr key={i} className="border-b border-gray-700/30 last:border-0 hover:bg-gray-700/10">
                {cols.map(c => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.right ? 'text-right' : ''} ${c.bold ? 'font-semibold ' + color : 'text-gray-300'}`}>
                    {c.fmt ? fmt(row[c.key]) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-4 py-4 text-sm text-gray-500">{emptyMsg}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Date picker + export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <button onClick={prevDay} className="p-1.5 rounded-lg bg-primary-500/15 hover:bg-primary-500/25 text-primary-300 transition"><ChevLeft size={15} /></button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 rounded-lg min-w-[140px] justify-center">
            <CalendarDays size={13} className="text-primary-400" />
            <span className="text-sm font-medium text-gray-100">{formatDateDisplay(date)}</span>
          </div>
          <button onClick={nextDay} disabled={date >= todayStr} className="p-1.5 rounded-lg bg-primary-500/15 hover:bg-primary-500/25 text-primary-300 transition disabled:opacity-30 disabled:cursor-not-allowed"><ChevRight size={15} /></button>
          {date !== todayStr && (
            <button onClick={() => setDate(todayStr)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 transition">Today</button>
          )}
        </div>
        {data && <PdfExportButton onExport={() => exportDailyCollectionPDF(data, gymName)} />}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
      ) : data && (
        <div className="space-y-4">
          <Section title="Member Fees" color="text-green-400" items={data.member_fees} totalKey="member_fees" emptyMsg="No member fees collected"
            cols={[{ key: 'member', label: 'Member' }, { key: 'package', label: 'Package' }, { key: 'amount', label: 'Amount', right: true, bold: true, fmt: true }]} />
          <Section title="Admission Fees" color="text-indigo-400" items={data.admission_fees} totalKey="admission_fees" emptyMsg="No admission fees collected"
            cols={[{ key: 'member', label: 'Member' }, { key: 'amount', label: 'Amount', right: true, bold: true, fmt: true }]} />
          <Section title="Inventory Sales" color="text-cyan-400" items={data.inventory_sales} totalKey="inventory_sales" emptyMsg="No inventory sales"
            cols={[{ key: 'product', label: 'Product' }, { key: 'quantity', label: 'Qty' }, { key: 'amount', label: 'Amount', right: true, bold: true, fmt: true }]} />
          <Section title="Expenses" color="text-red-400" items={data.expenses} totalKey="total_expenses" emptyMsg="No expenses recorded"
            cols={[{ key: 'title', label: 'Description' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', right: true, bold: true, fmt: true }]} />

          {/* Net summary */}
          <div className="card p-5">
            <div className="flex items-center justify-between py-2 border-b border-gray-700">
              <span className="text-sm text-gray-400">Total Collected (IN)</span>
              <span className="font-semibold text-green-400">{fmt(data.totals.total_in)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-700">
              <span className="text-sm text-gray-400">Total Expenses (OUT)</span>
              <span className="font-semibold text-red-400">{fmt(data.totals.total_expenses)}</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-base font-bold text-gray-100">Net Cash in Hand</span>
              <span className={`text-xl font-bold ${data.totals.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(data.totals.net)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'ledger', label: 'Ledger', icon: BookOpen },
  { id: 'income', label: 'Income Statement', icon: TrendingUp },
  { id: 'expenses', label: 'Expense Categories', icon: PieChart },
  { id: 'daily', label: 'Daily Collection', icon: ClipboardList },
]

export default function Finance() {
  const [activeTab, setActiveTab] = useState('ledger')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-primary-400">Finance</h1>
        <p className="text-gray-500 text-sm mt-1">Complete financial overview of your gym</p>
      </div>

      {/* Tab toggles */}
      <div className="flex gap-2 border-b border-gray-700 pb-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`no-fx flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-t ${
              activeTab === id
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {activeTab === 'ledger' && <LedgerTab />}
        {activeTab === 'income' && <IncomeStatementTab />}
        {activeTab === 'expenses' && <ExpenseCategoriesTab />}
        {activeTab === 'daily' && <DailyCollectionTab />}
      </div>
    </div>
  )
}
