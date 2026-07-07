import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../../api/axios'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Fallback placeholder (used only when no person is supplied) — deterministic.
function placeholderPresent(year, month, day) {
  const seed = Math.sin((year * 12 + month) * 31 + day) * 10000
  return (seed - Math.floor(seed)) > 0.3
}

export default function AttendanceCalendar({ title = 'Attendance', type, personId }) {
  const [current, setCurrent] = useState(new Date())
  const year = current.getFullYear()
  const month = current.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const live = !!personId
  const { data } = useQuery({
    queryKey: ['attendance-cal', type, personId, year, month],
    enabled: live,
    queryFn: async () => {
      const { data } = await api.get('/attendance/', {
        params: { type: type || 'member', id: personId, scope: 'monthly', date: iso(year, month, 1) },
      })
      return data.rows?.[0]?.days || {}
    },
  })

  const prev = () => setCurrent(new Date(year, month - 1, 1))
  const next = () => setCurrent(new Date(year, month + 1, 1))
  const today = new Date()
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const statusFor = (d) => {
    const date = new Date(year, month, d)
    if (date > today) return 'upcoming'
    if (live) return (data?.[iso(year, month, d)] || {}).status || 'absent'
    return placeholderPresent(year, month, d) ? 'present' : 'absent'
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-100">{title}</h3>
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-100 w-32 text-center">{MONTHS[month]} {year}</span>
          <button onClick={next} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} />
          const st = statusFor(d)
          const isToday = isCurrentMonth && d === today.getDate()
          return (
            <div key={d} className="flex items-center justify-center aspect-square">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
                ${isToday ? 'ring-2 ring-primary-400' : ''}
                ${st === 'upcoming' ? 'text-gray-500' :
                  st === 'present'
                    ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                    : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                }
              `}>
                {d}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-4 mt-4 pt-3 border-t border-gray-700">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-green-500/50" /> Present
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-red-500/50" /> Absent
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 rounded-full bg-gray-700" /> Upcoming
        </div>
      </div>
    </div>
  )
}
