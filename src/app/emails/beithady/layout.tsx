import { requireDomainAccess } from '@/lib/auth';

// Phase 12 backlog: enforce domain access at the layout level so
// unauthorized users 404 before any child page renders.
export default async function BeithadyDomainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireDomainAccess('beithady');
  return <>{children}</>;
}
