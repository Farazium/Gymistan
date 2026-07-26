import toast from 'react-hot-toast'

// Gymistan's own addresses. One place to change them, so a new domain doesn't
// have to be hunted down across the landing page, settings and the terms.
export const SUPPORT_EMAIL = 'support@gymistan.dev'
export const CONTACT_EMAIL = 'contact@gymistan.dev'

// A mailto that opens with its subject already filled in, so a reply doesn't
// have to start by asking what the mail is about.
export const mailto = (email, subject) => (subject
  ? `mailto:${email}?subject=${encodeURIComponent(subject)}`
  : `mailto:${email}`)

// A machine with no mail app registered answers a mailto click with nothing at
// all — no window, no error. Most gym owners live in Gmail on the web, so that
// is the common case, not the odd one. Every click therefore also puts the
// address on the clipboard and says so out loud; whoever does have a mail app
// still gets it opened by the href.
export const copyEmail = async (email) => {
  try {
    await navigator.clipboard.writeText(email)
    toast.success(`${email} copied — paste it into your email`)
  } catch {
    // Clipboard refused (old browser, or the page isn't a secure context).
    // Say the address out loud instead so it can still be written down.
    toast(`Write to us at ${email}`)
  }
}
