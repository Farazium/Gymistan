// Mark the money-driven views (Finance page + Dashboard) stale so they refetch
// fresh figures. Call this from any mutation that changes income or expenses
// (payments, expenses, salary, admission fees) so their totals stay in sync
// instead of relying on incidental cache behaviour.
export function invalidateFinance(queryClient) {
  queryClient.invalidateQueries({
    predicate: (q) => {
      const key = String(q.queryKey?.[0] ?? '')
      return key.startsWith('finance') || key === 'dashboard'
    },
  })
}
