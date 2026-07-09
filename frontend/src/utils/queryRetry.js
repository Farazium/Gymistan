// Shared react-query helpers for record-detail fetches.
//
// A detail page should only say "not found" when the server actually says 404.
// A network blip, a 5xx, a server restart, or a request that never completed is
// NOT a missing record — retrying usually clears it. Treating those as "not found"
// is how a momentary backend hiccup makes every member/trainer look deleted.

// True only for a real "this record does not exist" response.
export function isNotFound(error) {
  return error?.response?.status === 404
}

// Retry transient failures (network / 5xx / timeout) a couple of times,
// but never retry a genuine 404 — that answer won't change.
export function retryUnlessNotFound(failureCount, error) {
  if (isNotFound(error)) return false
  return failureCount < 2
}
