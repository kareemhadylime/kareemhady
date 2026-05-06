import type { Template, ServiceLine } from '../schema';
import { hkTemplate } from './hk';
import { mepTemplate } from './mep';
import { landscapeTemplate } from './landscape';
import { securityTemplate } from './security';
import { pestCtrlTemplate } from './pest-ctrl';
import { wasteMgmtTemplate } from './waste-mgmt';
import { backOfficeTemplate } from './back-office';
import { governmentalCategory } from './governmental';

export const ALL_SERVICE_LINES: ServiceLine[] = [
  'hk', 'mep', 'landscape', 'security', 'pest_ctrl', 'waste_mgmt', 'back_office',
];

const TEMPLATES_BY_SERVICE: Record<ServiceLine, Template> = {
  hk: hkTemplate,
  mep: mepTemplate,
  landscape: landscapeTemplate,
  security: securityTemplate,
  pest_ctrl: pestCtrlTemplate,
  waste_mgmt: wasteMgmtTemplate,
  back_office: backOfficeTemplate,
};

/**
 * Resolve a service-line template by (service_line, version). Returns a
 * deep-cloned-style copy with the Governmental category appended via
 * post-merge. Templates carry only their own categories; Governmental is
 * an FMPLUS-wide concern injected here so individual templates stay focused.
 *
 * Throws on unknown service_line or unsupported version.
 */
export function getTemplate(serviceLine: ServiceLine, version: number): Template {
  if (version !== 1) {
    throw new Error(`Unsupported template version ${version} for service line ${serviceLine}`);
  }
  const base = TEMPLATES_BY_SERVICE[serviceLine];
  if (!base) {
    throw new Error(`No template registered for service line ${serviceLine}`);
  }
  return {
    ...base,
    categories: [...base.categories, governmentalCategory],
  };
}

// Shim for callers that don't care about versioning. Currently we only
// have v1 templates, so the "latest" is always v1. Wrapper exists so
// commit.ts and other consumers don't have to hard-code the version.
export function getLatestTemplate(serviceLine: ServiceLine): Template {
  return getTemplate(serviceLine, 1);
}

// Catalog row shape expected by the v1 settings page (which renders a
// table of service-line templates with code / label / status).
export type ServiceLineCatalogEntry = {
  code: ServiceLine;
  label: string;
  template_status: 'active' | 'stub';
};

// Minimal catalog so /fmplus/financial/budget/settings still builds.
// Status reflects which templates carry real category data vs which
// are stubs from migration 0080. Update when more templates go live.
export const SERVICE_LINE_CATALOG: ServiceLineCatalogEntry[] = [
  { code: 'hk',          label: 'Housekeeping',     template_status: 'active' },
  { code: 'mep',         label: 'MEP',              template_status: 'stub'   },
  { code: 'landscape',   label: 'Landscape',        template_status: 'stub'   },
  { code: 'security',    label: 'Security',         template_status: 'stub'   },
  { code: 'pest_ctrl',   label: 'Pest Control',     template_status: 'stub'   },
  { code: 'waste_mgmt',  label: 'Waste Management', template_status: 'stub'   },
  { code: 'back_office', label: 'Back Office',      template_status: 'stub'   },
];
