// Gymistan's own addresses. One place to change them, so a new domain doesn't
// have to be hunted down across the landing page, settings and the terms.
export const SUPPORT_EMAIL = 'support@gymistan.dev'
export const CONTACT_EMAIL = 'contact@gymistan.dev'

// A mailto that opens with its subject already filled in, so a reply doesn't
// have to start by asking what the mail is about.
export const mailto = (email, subject) => (subject
  ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
  : `mailto:${email}`)
