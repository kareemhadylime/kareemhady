import { Briefcase, FolderOpen, ChevronRight, X } from 'lucide-react';
import { PillLink } from './PeriodControls';
import type { FmplusPlan, FmplusProject } from '@/lib/fmplus/analytic-picker';

// Cascading 2-tier analytic-account picker — matches Beithady's Scope/
// Analytic-Account card pattern but with FMPLUS's project-level structure.
//
//   Tier 1: Service Line (single-select, mandatory before Tier 2 appears)
//           — pills mapped to Odoo analytic_plans (HK / MEP / Mix / Security)
//   Tier 2: Projects under that service line (single-select default,
//           multi-select toggleable, capped at 5 for side-by-side compare)
//
// "All" wins by default — no plan/projects filter applied.

type BuildHref = (overrides?: Partial<Record<string, string | undefined>>) => string;

export function AnalyticPicker(props: {
  plans: FmplusPlan[];
  projects: FmplusProject[];        // empty when no plan selected
  selectedPlanSlug: string | null;
  selectedProjectIds: number[];     // empty = all projects under plan
  multi: boolean;                   // toggle: single-select vs multi-select
  buildHref: BuildHref;
}) {
  const { plans, projects, selectedPlanSlug, selectedProjectIds, multi } = props;

  const planSelected = !!selectedPlanSlug;
  const onAllPlans = !planSelected;

  // Build hrefs that reset child state on parent change
  const planHref = (slug: string | null) =>
    props.buildHref({
      plan:    slug ?? '',
      account: '',     // reset single
      accounts: '',    // reset multi
    });
  const projectHref = (id: number | null) => {
    if (id === null) {
      return props.buildHref({ account: '', accounts: '' });
    }
    if (multi) {
      const set = new Set(selectedProjectIds);
      if (set.has(id)) set.delete(id);
      else if (set.size < 5) set.add(id);
      return props.buildHref({
        accounts: Array.from(set).join(','),
        account: '',
      });
    }
    // single mode
    return props.buildHref({
      account: String(id),
      accounts: '',
    });
  };

  const toggleMultiHref = props.buildHref({
    multi: multi ? '0' : '1',
    // when leaving multi mode, collapse to first selected so we don't
    // strand the user with N selections that don't render in single view
    ...(multi && selectedProjectIds.length > 0
      ? { account: String(selectedProjectIds[0]), accounts: '' }
      : {}),
  });

  const selectedSet = new Set(selectedProjectIds);
  const activeProjects = projects.filter(p => p.active);

  return (
    <section className="ix-card p-5 space-y-4">
      {/* Tier 1 — Service Line */}
      <div>
        <div className="flex items-start gap-2 mb-2">
          <Briefcase size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div>
            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Service Line</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Pick a service line first to drill into its projects</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PillLink href={planHref(null)} label="All" active={onAllPlans} />
          {plans.map(p => (
            <PillLink
              key={p.id}
              href={planHref(p.slug)}
              label={`${p.name} (${p.active_count})`}
              active={selectedPlanSlug === p.slug}
            />
          ))}
        </div>
      </div>

      {/* Tier 2 — Projects under selected plan */}
      {planSelected && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-start gap-2">
              <FolderOpen size={14} className="text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  Projects {plans.find(p => p.slug === selectedPlanSlug)?.name
                    ? `· ${plans.find(p => p.slug === selectedPlanSlug)!.name}`
                    : ''}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeProjects.length === 0
                    ? 'No projects with activity in this period.'
                    : multi
                      ? `Multi-select on — pick up to 5 to compare side-by-side. ${selectedProjectIds.length}/5 selected.`
                      : 'Single-select. Toggle multi to compare projects.'}
                </p>
              </div>
            </div>
            <a
              href={toggleMultiHref}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition whitespace-nowrap ${
                multi
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800'
                  : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded border inline-flex items-center justify-center text-[8px] leading-none ${
                  multi
                    ? 'bg-indigo-500 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
                }`}>
                  {multi && '✓'}
                </span>
                Multi-select
              </span>
            </a>
          </div>

          {/* Selected chips (multi mode only) */}
          {multi && selectedProjectIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3 p-2 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900">
              {selectedProjectIds.map(id => {
                const p = projects.find(x => x.id === id);
                if (!p) return null;
                return (
                  <a
                    key={id}
                    href={projectHref(id)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                    title={`Remove ${p.name}`}
                  >
                    {p.name}
                    <X size={11} />
                  </a>
                );
              })}
              <a
                href={projectHref(null)}
                className="text-[11px] text-slate-500 dark:text-slate-400 underline ml-1 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Clear all
              </a>
            </div>
          )}

          {/* Project pills */}
          <div className="flex flex-wrap items-center gap-2">
            {!multi && (
              <PillLink
                href={projectHref(null)}
                label="All projects"
                active={selectedProjectIds.length === 0}
              />
            )}
            {activeProjects.map(p => {
              const isSel = selectedSet.has(p.id);
              const disabled = multi && !isSel && selectedProjectIds.length >= 5;
              if (disabled) {
                return (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-50 dark:bg-slate-900 text-slate-300 dark:text-slate-600 border border-slate-200 dark:border-slate-800 cursor-not-allowed"
                    title="Cap of 5 reached — remove one to add another"
                  >
                    {p.name}
                  </span>
                );
              }
              return (
                <PillLink
                  key={p.id}
                  href={projectHref(p.id)}
                  label={p.name}
                  active={isSel}
                />
              );
            })}
            {activeProjects.length === 0 && (
              <p className="text-[12px] text-slate-400 dark:text-slate-500 italic">
                Try a different period to find active projects under this service line.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hint when on All — what's coming next */}
      {!planSelected && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 italic border-t border-slate-200 dark:border-slate-800 pt-3">
          <ChevronRight size={12} />
          Tip: pick a Service Line above to filter the P&amp;L by individual projects (single or up-to-5 side-by-side).
        </div>
      )}
    </section>
  );
}
