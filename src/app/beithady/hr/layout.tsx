import { requireDomainAccess } from '@/lib/auth';

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  await requireDomainAccess('beithady');
  return <>{children}</>;
}
