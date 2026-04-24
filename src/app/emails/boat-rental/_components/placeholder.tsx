import { TabNav, type TabItem } from './tabs';

// Stub page used while the boat-rental module is being built out. Shows
// the tab nav for the current role so navigation works, plus a short
// description of what will live on this tab once implemented.
export function TabPlaceholder({
  title,
  description,
  tabs,
  currentPath,
  bullets,
}: {
  title: string;
  description: string;
  tabs: TabItem[];
  currentPath: string;
  bullets?: string[];
}) {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </header>
      <TabNav tabs={tabs} currentPath={currentPath} />
      <section className="mt-8 ix-card p-8 text-center">
        <p className="text-sm text-slate-500">
          Coming next. This view will be built out after migration 0016 is applied.
        </p>
        {bullets && bullets.length > 0 && (
          <ul className="mt-4 text-left max-w-md mx-auto text-sm text-slate-600 space-y-1.5 list-disc list-inside">
            {bullets.map(b => <li key={b}>{b}</li>)}
          </ul>
        )}
      </section>
    </>
  );
}
