import { redirect } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';

export const dynamic = 'force-dynamic';

// Communication landing routes straight to Guesty Inbox (the only
// fully-populated channel today). WA Cloud and WA Casual show
// configuration stubs until their gateways are wired.
export default async function BeithadyCommunicationLanding() {
  await requireBeithadyPermission('communication', 'read');
  redirect('/emails/beithady/communication/guesty');
}
