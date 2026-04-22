import { notFound } from 'next/navigation';
import { requireDomainAccess } from '@/lib/auth';
import { isDomain } from '@/lib/rules/presets';

// Phase 12 backlog: enforce domain access at the layout level so
// unauthorized users 404 before any child page renders. Validates the
// dynamic segment too — unknown domain slugs 404 instead of leaking a
// page shell.
export default async function DynamicDomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  if (!isDomain(domain)) notFound();
  await requireDomainAccess(domain);
  return <>{children}</>;
}
