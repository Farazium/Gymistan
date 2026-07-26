import { composeUrl } from '../../utils/contact'

// An address that opens a real compose window when clicked — Gmail's, in a new
// tab, addressed and titled. See `composeUrl` for why not `mailto:`.
export default function EmailLink({ email, subject, className, children }) {
  return (
    <a
      href={composeUrl(email, subject)}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {children || email}
    </a>
  )
}
