// `w-full` alone doesn't save a table on a phone: it just crushes the columns
// into unreadable slivers instead of scrolling. The min-width is the floor the
// columns are allowed to reach before the wrapper starts scrolling sideways —
// it never applies on a desktop, where the card is wider than the floor anyway.
// Wide rosters pass a bigger one.
export function Table({ children, minWidth = 'min-w-[32rem]' }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${minWidth}`}>{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return (
    <thead>
      <tr className="border-b border-primary-500/25 bg-primary-500/10">
        {children}
      </tr>
    </thead>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-primary-400 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

export function Tbody({ children }) {
  return <tbody className="divide-y divide-gray-600">{children}</tbody>
}

export function Tr({ children, className = '' }) {
  return <tr className={`hover:bg-primary-500/10 transition-colors ${className}`}>{children}</tr>
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-gray-100 ${className}`}>{children}</td>
}
