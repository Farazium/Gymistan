// Pakistani mobile numbers get typed both ways — 03121234567 and 3121234567 —
// and both are fine to type. Only one shape is ever saved: 03xxxxxxxxx.
// Mirrors backend/apps/common/phone.py; keep the two in step.

export function normalizePkMobile(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('92')) digits = digits.slice(2)
  digits = digits.replace(/^0+/, '')
  return /^3\d{9}$/.test(digits) ? `0${digits}` : null
}

export const PHONE_ERROR = 'Enter a valid mobile number — 03xxxxxxxxx or 3xxxxxxxxx'

// react-hook-form rule: catches a number that is a digit short or a digit long,
// which a plain "digits only" check would happily let through.
export const phoneRule = (value) => (normalizePkMobile(value) ? true : PHONE_ERROR)
