import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Lime Investments',
  description: 'Terms of service for the Lime Investments operations platform.',
};

export const dynamic = 'force-static';

const LAST_UPDATED = '15 May 2026';
const CONTACT_EMAIL = 'kareem.hady@gmail.com';
const COMPANY = 'Lime Investments';
const APP_HOST = 'app.limeinc.cc';

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800 leading-relaxed">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">Legal</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="space-y-3 text-sm">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the internal
          operations platform hosted at <code>{APP_HOST}</code> (the &ldquo;Platform&rdquo;), operated
          by {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). The Platform is a
          private, single-tenant tool used by {COMPANY} staff and authorised contractors to manage
          our internal business operations across hospitality (Beit Hady), boat rental, e-commerce
          (Kika), and related subsidiaries.
        </p>
      </section>

      <h2 className="mt-10 mb-3 text-xl font-semibold">1. Eligibility &amp; access</h2>
      <p className="text-sm">
        Access to the Platform is restricted to individuals who have been granted credentials
        by an administrator of {COMPANY}. The Platform is not offered to the public. By accessing
        the Platform you confirm you are an authorised operator and agree to these Terms.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">2. Acceptable use</h2>
      <p className="text-sm">When using the Platform you agree NOT to:</p>
      <ul className="list-disc pl-5 space-y-2 text-sm mt-2">
        <li>Access data, accounts, or features outside the scope of your assigned role.</li>
        <li>Publish content (including via integrated social-media APIs such as TikTok, Meta,
          or Google) that violates the terms of service of the destination platform, that
          infringes third-party intellectual property, or that is unlawful in any jurisdiction
          where {COMPANY} operates.</li>
        <li>Disable, bypass, or interfere with security, audit, or rate-limiting mechanisms.</li>
        <li>Share credentials with unauthorised individuals, or use the Platform to impersonate
          others.</li>
        <li>Use the Platform to send unsolicited messages or to engage in spam, phishing, or
          fraud.</li>
        <li>Reverse-engineer the Platform or its integrations except to the extent permitted by
          mandatory local law.</li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-semibold">3. Connected-service integrations</h2>
      <p className="text-sm">
        The Platform integrates with third-party services (including but not limited to TikTok,
        Meta/Facebook, Google, Stripe, Anthropic, Guesty, Odoo, PriceLabs, and Green-API) on
        behalf of {COMPANY}-owned business accounts. Use of those services through the Platform
        is also governed by each provider&rsquo;s own terms. Operators must ensure that any content
        published, message sent, or transaction initiated complies with the destination platform&rsquo;s
        community guidelines, advertising policies, and applicable law.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">4. Content responsibility</h2>
      <p className="text-sm">
        Operators are solely responsible for the content they upload, publish, or transmit through
        the Platform, including marketing creatives, reservation communications, employee documents,
        and all media. {COMPANY} retains no ownership over content uploaded by operators beyond the
        scope of its operational use. Operators warrant that they hold (or have lawful permission
        for) all rights necessary to use the content they submit.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">5. Suspension &amp; termination</h2>
      <p className="text-sm">
        We may suspend or terminate access to the Platform, with or without notice, for any
        operator who breaches these Terms, who is no longer affiliated with {COMPANY}, or
        whose access poses a security risk. Connected-service tokens linked to the suspended
        operator will be revoked.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">6. Disclaimer of warranties</h2>
      <p className="text-sm">
        The Platform is provided &ldquo;as is&rdquo; for internal business use. To the maximum
        extent permitted by law, {COMPANY} makes no warranties of any kind, express or implied,
        regarding the Platform&rsquo;s availability, reliability, fitness for any particular purpose,
        or accuracy of data retrieved from third-party services.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">7. Limitation of liability</h2>
      <p className="text-sm">
        To the maximum extent permitted by applicable law, {COMPANY} and its affiliates shall not
        be liable for any indirect, incidental, special, consequential, or punitive damages,
        including loss of profits, data, or business opportunities, arising out of or in connection
        with use of the Platform.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">8. Changes to these Terms</h2>
      <p className="text-sm">
        We may update these Terms from time to time. The &ldquo;Last updated&rdquo; date at the top
        of the page reflects the most recent revision. Continued use of the Platform after a
        revision constitutes acceptance of the updated Terms.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">9. Governing law</h2>
      <p className="text-sm">
        These Terms are governed by the laws of the Arab Republic of Egypt, without regard to its
        conflict-of-law principles. Disputes arising out of or in connection with these Terms
        shall be submitted to the exclusive jurisdiction of the competent courts of Cairo, Egypt.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">10. Contact</h2>
      <p className="text-sm">
        Questions about these Terms can be directed to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <a href="/legal/privacy" className="text-emerald-700 underline">Privacy Policy</a>
        {' · '}
        <a href="/" className="text-emerald-700 underline">Home</a>
      </footer>
    </main>
  );
}
