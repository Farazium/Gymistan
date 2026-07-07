// Turn an axios/DRF error into a human-readable message.
// DRF returns validation errors as { field: ["msg"] } or { non_field_errors: [...] }
// or { detail: "..." } — this surfaces the most useful one instead of a generic "Error".
export function apiErrorMessage(err, fallback = 'Something went wrong') {
  const data = err?.response?.data
  if (!data) {
    return err?.code === 'ERR_NETWORK' ? 'Network error — please try again' : fallback
  }
  if (typeof data === 'string') return data
  if (data.detail) return String(data.detail)
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length) {
    return String(data.non_field_errors[0])
  }
  // First field-level error, e.g. { amount: ["Must be greater than 0"] }
  const first = Object.values(data).find((v) => v != null && (!Array.isArray(v) || v.length))
  if (first) return String(Array.isArray(first) ? first[0] : first)
  return fallback
}
