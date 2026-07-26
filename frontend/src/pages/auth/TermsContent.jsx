// Terms & Conditions for Gymistan — written from the actual product surface:
// multi-tenant gym management for Pakistan (members, PKR payments, prepaid
// WhatsApp messaging via Meta, ZKTeco biometric attendance, tiered plans).
// Rendered inside the shared Modal on the login page.

import { SUPPORT_EMAIL } from '../../utils/contact'
import EmailLink from '../../components/ui/EmailLink'

function Section({ n, title, children }) {
  return (
    <section className="mb-5">
      <h3 className="text-gray-100 font-semibold text-sm mb-1.5">
        <span className="text-primary-300">{n}.</span> {title}
      </h3>
      <div className="text-gray-400 text-[13px] leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function TermsContent() {
  return (
    <div>
      <p className="text-gray-400 text-[13px] leading-relaxed mb-5">
        These Terms govern access to and use of <span className="text-gray-200 font-medium">Gymistan</span>,
        a gym management platform for fitness businesses in Pakistan. By signing in or
        using the platform, the gym and its authorised staff (&ldquo;you&rdquo;) agree to these Terms. If you
        do not agree, do not use the platform.
      </p>
      <p className="text-gray-500 text-xs mb-6">Last updated: July 2026</p>

      <Section n="1" title="Accounts & Access">
        <p>
          Each gym is provisioned as a separate account. You are responsible for keeping login
          credentials confidential and for all activity that takes place under your account. Accounts
          are for your gym&rsquo;s own staff only and may not be shared, resold, or transferred. Notify us
          promptly of any suspected unauthorised access.
        </p>
      </Section>

      <Section n="2" title="Acceptable Use">
        <p>
          You agree to use Gymistan only for lawful gym-administration purposes and to enter accurate
          information. You will not attempt to reverse-engineer, copy, disrupt, overload, or gain
          unauthorised access to the platform or to other gyms&rsquo; data.
        </p>
      </Section>

      <Section n="3" title="Member Data & Privacy">
        <p>
          You control the member information you record (such as names, phone numbers, packages, and
          payment history). You are responsible for having a lawful basis and any necessary consent to
          collect and process that data. Gymistan stores and processes it on your behalf to provide the
          service, and does not sell member data.
        </p>
      </Section>

      <Section n="4" title="Biometric Attendance">
        <p>
          Where you connect a biometric device (e.g. ZKTeco) for attendance, the device identifiers and
          check-in records are processed solely to produce attendance records for your gym. You are
          responsible for informing members and trainers that biometric attendance is in use.
        </p>
      </Section>

      <Section n="5" title="WhatsApp Messaging">
        <p>
          Receipts, welcome slips, and renewal reminders can be delivered over WhatsApp through Meta&rsquo;s
          WhatsApp Business Platform. By sending these, you confirm that recipients have agreed to be
          contacted, and you agree to comply with the WhatsApp Business and Commerce policies.
        </p>
        <p>
          Messaging runs on <span className="text-gray-200">prepaid message credits</span>. Credits are
          purchased in advance, priced in PKR, and are <span className="text-gray-200">non-refundable</span> once
          added. Delivery depends on Meta and on the recipient&rsquo;s device and settings, and cannot be
          guaranteed; a message shown as sent may not always be delivered.
        </p>
      </Section>

      <Section n="6" title="Plans, Fees & Payments">
        <p>
          Access is offered on tiered plans (such as Starter, Connect, Track, and Elite). Subscription
          fees and message-credit purchases are billed in Pakistani Rupees (PKR) and, unless stated
          otherwise, are non-refundable. Fees may change with prior notice.
        </p>
        <p>
          Payments you record from your own members are transactions between you and them; Gymistan simply
          keeps the record and is not a party to those payments.
        </p>
      </Section>

      <Section n="7" title="Availability & Data">
        <p>
          The platform is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We aim for
          reliable, continuous service but do not guarantee uninterrupted access, and maintenance or
          outages may occur. You remain responsible for reviewing your records for accuracy; we take
          reasonable measures to safeguard and back up data.
        </p>
      </Section>

      <Section n="8" title="Limitation of Liability">
        <p>
          To the extent permitted by law, Gymistan is not liable for indirect or
          consequential losses, lost profits, or loss of data. Our total liability for any claim relating
          to the service is limited to the amount you paid for it in the three months before the claim.
        </p>
      </Section>

      <Section n="9" title="Suspension & Termination">
        <p>
          We may suspend or terminate access for non-payment or breach of these Terms. On termination you
          may request an export of your gym&rsquo;s data within a reasonable period, after which it may be
          deleted.
        </p>
      </Section>

      <Section n="10" title="Changes & Governing Law">
        <p>
          We may update these Terms from time to time; continued use after an update means you accept the
          revised Terms. These Terms are governed by the laws of Pakistan, and the courts of Pakistan have
          jurisdiction over any dispute.
        </p>
      </Section>

      <p className="text-gray-500 text-xs mt-6 pt-4 border-t border-gray-700">
        Questions about these Terms? Contact your Gymistan provider at{' '}
        <EmailLink
          email={SUPPORT_EMAIL}
          subject="Question about the Gymistan Terms"
          className="text-primary-300 underline underline-offset-2 hover:text-primary-200 transition"
        />.
      </p>
    </div>
  )
}
