import { mailto, copyEmail } from '../../utils/contact'

// An address that is always reachable. The href still hands off to a mail app
// for whoever has one; the click copies the address either way, so a machine
// with no mail app never answers with silence. See `copyEmail`.
export default function EmailLink({ email, subject, className, children }) {
  return (
    <a href={mailto(email, subject)} onClick={() => copyEmail(email)} className={className}>
      {children || email}
    </a>
  )
}
