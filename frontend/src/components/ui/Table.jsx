export function Table({ children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Thead({ children }) {
  return (
    <thead>
      <tr className="border-b border-gray-600 bg-gray-700/60">
        {children}
      </tr>
    </thead>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wide ${className}`}>
      {children}
    </th>
  )
}

export function Tbody({ children }) {
  return <tbody className="divide-y divide-gray-600">{children}</tbody>
}

export function Tr({ children, className = '' }) {
  return <tr className={`hover:bg-gray-700/40 transition-colors ${className}`}>{children}</tr>
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-gray-100 ${className}`}>{children}</td>
}
