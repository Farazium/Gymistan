// Single source of truth for money + date formatting so amounts read the same
// everywhere (grouping, "PKR" prefix). Pakistan locale, PKR-native.

export const fmtCurrency = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK')}`

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-PK') : '—')
