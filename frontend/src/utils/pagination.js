import { useState } from 'react'

// "All" stays on the menu because a gym often wants the whole roster in one
// scroll, but it is never the default: a few hundred rows drawn at once is
// exactly what makes an older laptop crawl.
export const PAGE_SIZES = [25, 50, 100, 'all']
const DEFAULT_SIZE = 25

// Paging state for a client-side list. `resetKey` is whatever the list is
// filtered by — when it changes the list underneath is a different one, so the
// view goes back to page 1 rather than stranding the reader on a page that no
// longer exists. A list that shrinks (rows deleted) is handled the same way.
export function usePageState(total, resetKey) {
  const [pageSize, setPageSize] = useState(DEFAULT_SIZE)
  const [page, setPage] = useState(1)
  const [prevKey, setPrevKey] = useState(resetKey)

  const pages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))
  if (resetKey !== prevKey) {
    setPrevKey(resetKey)
    setPage(1)
  } else if (page > pages) {
    setPage(pages)
  }

  const slice = (list) => (pageSize === 'all' ? list : list.slice((page - 1) * pageSize, page * pageSize))

  // Changing the page size keeps the reader roughly where they were rather than
  // throwing them back to the top of the list.
  const changePageSize = (size) => {
    const firstRow = pageSize === 'all' ? 0 : (page - 1) * pageSize
    setPageSize(size)
    setPage(size === 'all' ? 1 : Math.floor(firstRow / size) + 1)
  }

  return { page, setPage, pageSize, setPageSize: changePageSize, slice }
}
