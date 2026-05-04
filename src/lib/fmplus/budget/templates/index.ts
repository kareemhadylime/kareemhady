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
