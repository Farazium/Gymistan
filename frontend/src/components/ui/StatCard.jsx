// Hover: the accent picks out the border and blooms a soft glow under the card
// as it lifts — the same treatment (and the same values) as the feature cards on
// the landing page, so a stat tile reads the same way wherever it appears.
const HOVER = 'transition-all duration-300 hover:-translate-y-1 hover:border-primary-500/40 hover:shadow-lg hover:shadow-primary-500/10'

export default function StatCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <div className={`card p-5 ${HOVER}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend !== undefined && (
            <p className={`text-xs mt-1 font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-lg bg-primary-500/15 text-primary-400">
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  )
}
