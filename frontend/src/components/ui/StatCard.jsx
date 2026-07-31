// Hover: the accent picks out the border and blooms a soft glow under the card
// as it lifts — the same treatment (and the same values) as the feature cards on
// the landing page, so a stat tile reads the same way wherever it appears.
const HOVER = 'transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/10'

export default function StatCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <div className={`card p-4 sm:p-5 ${HOVER}`}>
      {/* Two of these sit side by side on a phone, so the text column has to be
          allowed to shrink and a long PKR figure has to be allowed to break —
          otherwise the amount pushes the icon off the card. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 break-words">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>
        {Icon && (
          <div className="shrink-0 p-2 sm:p-2.5 rounded-lg bg-primary-500/15 text-primary-400">
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  )
}
