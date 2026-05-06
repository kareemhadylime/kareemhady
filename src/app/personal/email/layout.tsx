// Each child page renders its own PersonalShell (including TopNav +
// breadcrumbs). Keeping this layout as a passthrough avoids the
// double-TopNav bug that came from stacking layouts.
export const dynamic = 'force-dynamic';

export default function PersonalEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
