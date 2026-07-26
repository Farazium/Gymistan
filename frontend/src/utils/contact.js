// Gymistan's own addresses. One place to change them, so a new domain doesn't
// have to be hunted down across the landing page, settings and the terms.
export const SUPPORT_EMAIL = 'support@gymistan.dev'
export const CONTACT_EMAIL = 'contact@gymistan.dev'

// Where a click on an address goes: Gmail's compose window, with the recipient
// and subject already filled in. A plain `mailto:` needs a mail app registered
// on the machine, and on one without it a click does nothing at all — no
// window, no error. Gym owners live in Gmail on the web, so that silence was
// the common case rather than the odd one.
export const composeUrl = (email, subject) => {
  const url = new URL('https://mail.google.com/mail/')
  url.searchParams.set('view', 'cm')
  url.searchParams.set('fs', '1')
  url.searchParams.set('to', email)
  if (subject) url.searchParams.set('su', subject)
  return url.toString()
}
