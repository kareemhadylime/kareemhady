import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Lime Investments',
  description: 'Privacy policy for the Lime Investments operations platform, including content posting integrations.',
};

export const dynamic = 'force-static';

const LAST_UPDATED = '15 May 2026';
const CONTACT_EMAIL = 'kareem.hady@gmail.com';
const COMPANY = 'Lime Investments';
const APP_HOST = 'app.limeinc.cc';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800 leading-relaxed">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <p className="text-xs uppercase tracking-wide text-slate-500">Legal</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="space-y-3 text-sm">
        <p>
          This Privacy Policy explains how {COMPANY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects,
          uses, stores, and protects information when you or our authorised operators use the
          internal operations platform hosted at <code>{APP_HOST}</code> (the &ldquo;Platform&rdquo;).
          The Platform is a private, single-tenant tool used by {COMPANY} staff to manage hospitality
          operations, marketing, finance, HR, and related business functions for our subsidiaries
          (including Beit Hady, Boat Rental, Kika, FMPLUS, and VoltAuto).
        </p>
        <p>
          The Platform is not offered as a public service. Access is limited to named operators
          who have been granted explicit credentials by an administrator.
        </p>
      </section>

      <h2 className="mt-10 mb-3 text-xl font-semibold">1. Information we collect</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>
          <strong>Operator account information:</strong> username, role, permissions, login activity,
          IP address, and browser user-agent — used to authenticate access and audit actions.
        </li>
        <li>
          <strong>Business operations data:</strong> reservations, guest contacts, employee records,
          financial transactions, marketing campaign metadata, and similar records that staff enter
          or that flow in from connected business systems (Guesty, Odoo, Stripe, PriceLabs, etc.).
        </li>
        <li>
          <strong>Third-party platform tokens:</strong> when an administrator connects an external
          service (Google Workspace, Meta/Facebook, TikTok, Stripe, Anthropic, WhatsApp via Green-API),
          we store the OAuth refresh tokens or API keys required to call those services on the
          business&rsquo;s behalf. All such tokens are encrypted at rest using AES-256-GCM.
        </li>
        <li>
          <strong>Media uploaded by operators:</strong> photos, videos, PDFs, and other documents
          uploaded by staff for use in marketing campaigns, employee files, or guest communications.
        </li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-semibold">2. How we use information</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>To provide the Platform&rsquo;s operational features to authorised staff.</li>
        <li>To call third-party services on behalf of the business (e.g. publish a marketing video
          to our own TikTok or Instagram account, send a transactional WhatsApp message to a guest
          who has opted in, retrieve reservation data from Guesty).</li>
        <li>To audit operator actions and detect misuse.</li>
        <li>To comply with legal, tax, and accounting obligations in jurisdictions where {COMPANY}
          and its subsidiaries operate.</li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-semibold">3. Content posting integrations (TikTok, Meta, Google, etc.)</h2>
      <div className="space-y-3 text-sm">
        <p>
          The Platform includes features that allow authorised marketing operators to publish
          content (videos, images, captions) to social media accounts <strong>that {COMPANY} owns
          and controls</strong>. We do not publish to end-user accounts and we do not act on behalf
          of any third party.
        </p>
        <p>
          For TikTok specifically: we use the TikTok Login Kit and Content Posting API. When an
          administrator connects a TikTok account via OAuth, we receive and store an encrypted
          refresh token, the account&rsquo;s <code>open_id</code>, and the public username. These are
          used solely to:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Refresh short-lived access tokens before each publish call.</li>
          <li>Submit videos via the Content Posting API to the connected TikTok account.</li>
          <li>Poll the publish status until the post is delivered to the account&rsquo;s inbox or
            published directly (depending on the option chosen by the operator).</li>
        </ul>
        <p>
          We never read other people&rsquo;s TikTok content, follower lists, direct messages, or any
          data outside the connected account&rsquo;s own publishing scope. Refresh tokens can be revoked
          at any time by an administrator from the Platform&rsquo;s Accounts page or by revoking access
          in the TikTok app settings (<code>tiktok.com/setting/manage-app-permissions</code>).
        </p>
      </div>

      <h2 className="mt-10 mb-3 text-xl font-semibold">4. Where data is stored</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>Application data: Supabase (PostgreSQL + Storage) hosted in the EU (eu-central-1).</li>
        <li>Application hosting: Vercel (production region: Washington D.C., USA — iad1).</li>
        <li>Encryption keys (AES-256-GCM): held only as Vercel environment variables, never written
          to source control.</li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-semibold">5. Sharing of data</h2>
      <p className="text-sm">
        We do not sell or rent personal data. Data is shared only with the third-party services
        the business has explicitly connected (e.g. TikTok when publishing a video; Google when
        sending an email; Stripe when processing a payment), and only for the purpose of
        completing the operator-requested action.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">6. Retention &amp; deletion</h2>
      <ul className="list-disc pl-5 space-y-2 text-sm">
        <li>Operator accounts and audit logs are retained for the lifetime of the Platform.</li>
        <li>Marketing assets and campaign records are retained until manually deleted by an
          authorised operator.</li>
        <li>Connected-service tokens are deleted when the corresponding account is disconnected
          or when the underlying provider revokes them.</li>
        <li>You may request deletion of personal data relating to you by emailing the contact
          address below.</li>
      </ul>

      <h2 className="mt-10 mb-3 text-xl font-semibold">7. Your rights</h2>
      <p className="text-sm">
        Depending on the jurisdiction in which you reside (e.g. GDPR for the EU, UAE PDPL,
        Egypt&rsquo;s Personal Data Protection Law), you may have rights to access, correct, port,
        or delete personal data we hold about you. To exercise these rights, contact us at the
        address below.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">8. Security</h2>
      <p className="text-sm">
        We use TLS for all data in transit, AES-256-GCM for OAuth refresh tokens at rest,
        per-operator authentication with role-based permissions, and Supabase Row Level Security
        on tenant-scoped tables. We log administrative actions for audit.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">9. Changes to this policy</h2>
      <p className="text-sm">
        We may update this Privacy Policy from time to time. The &ldquo;Last updated&rdquo; date at
        the top of the page reflects the most recent revision. Material changes will be communicated
        to active operators directly.
      </p>

      <h2 className="mt-10 mb-3 text-xl font-semibold">10. Contact</h2>
      <p className="text-sm">
        Questions or requests relating to this Privacy Policy can be sent to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-emerald-700 underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <a href="/legal/terms" className="text-emerald-700 underline">Terms of Service</a>
        {' · '}
        <a href="/" className="text-emerald-700 underline">Home</a>
      </footer>
    </main>
  );
}
