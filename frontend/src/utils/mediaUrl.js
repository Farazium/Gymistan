import { API_ORIGIN } from '../api/axios'

// Resolve a stored image reference to a usable src. Backend uploads come as a
// server path (prefix the origin); a superadmin's locally-saved background is a
// data: URL and an absolute http(s) URL is already complete — use those as-is.
export function mediaUrl(ref) {
  if (!ref) return null
  if (ref.startsWith('data:') || ref.startsWith('http')) return ref
  return `${API_ORIGIN}${ref}`
}
