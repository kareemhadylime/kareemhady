import type { ServiceLine, TemplateSchemaJsonT, AccountMapJsonT } from '../schema';
import { HK_V1_SCHEMA, HK_V1_ACCOUNT_MAP } from './hk';
import { MEP_V1_SCHEMA, MEP_V1_ACCOUNT_MAP } from './mep';
import { LANDSCAPE_V1_SCHEMA, LANDSCAPE_V1_ACCOUNT_MAP } from './landscape';
import { SECURITY_V1_SCHEMA, SECURITY_V1_ACCOUNT_MAP } from './security';
import { PEST_CTRL_V1_SCHEMA, PEST_CTRL_V1_ACCOUNT_MAP } from './pest-ctrl';
import { WASTE_MGMT_V1_SCHEMA, WASTE_MGMT_V1_ACCOUNT_MAP } from './waste-mgmt';

export type Template = {
  service_line: ServiceLine;
  version: number;
  is_stub: boolean;
  schema_json: TemplateSchemaJsonT;
  account_map_json: AccountMapJsonT;
};

const REGISTRY: Record<string, Template> = {
  'hk:1':         { service_line: 'hk',         version: 1, is_stub: false, schema_json: HK_V1_SCHEMA,         account_map_json: HK_V1_ACCOUNT_MAP },
  'mep:1':        { service_line: 'mep',        version: 1, is_stub: true,  schema_json: MEP_V1_SCHEMA,        account_map_json: MEP_V1_ACCOUNT_MAP },
  'landscape:1':  { service_line: 'landscape',  version: 1, is_stub: true,  schema_json: LANDSCAPE_V1_SCHEMA,  account_map_json: LANDSCAPE_V1_ACCOUNT_MAP },
  'security:1':   { service_line: 'security',   version: 1, is_stub: true,  schema_json: SECURITY_V1_SCHEMA,   account_map_json: SECURITY_V1_ACCOUNT_MAP },
  'pest_ctrl:1':  { service_line: 'pest_ctrl',  version: 1, is_stub: true,  schema_json: PEST_CTRL_V1_SCHEMA,  account_map_json: PEST_CTRL_V1_ACCOUNT_MAP },
  'waste_mgmt:1': { service_line: 'waste_mgmt', version: 1, is_stub: true,  schema_json: WASTE_MGMT_V1_SCHEMA, account_map_json: WASTE_MGMT_V1_ACCOUNT_MAP },
};

export function getTemplate(serviceLine: ServiceLine, version: number): Template {
  const key = `${serviceLine}:${version}`;
  const t = REGISTRY[key];
  if (!t) throw new Error(`Unknown template ${key}`);
  return t;
}

export function getLatestTemplate(serviceLine: ServiceLine): Template {
  // v1 is the only version today; widen this when v2 lands.
  return getTemplate(serviceLine, 1);
}

export const SERVICE_LINE_CATALOG: Array<{
  code: ServiceLine;
  label: string;
  odoo_plan_hint: string;
  template_status: 'ready' | 'stub';
}> = [
  { code: 'hk',         label: 'Housekeeping',        odoo_plan_hint: 'HK Projects',       template_status: 'ready' },
  { code: 'mep',        label: 'MEP',                 odoo_plan_hint: 'MEP Projects',      template_status: 'stub'  },
  { code: 'landscape',  label: 'Landscape',           odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
  { code: 'security',   label: 'Security',            odoo_plan_hint: 'Security Projects', template_status: 'stub'  },
  { code: 'pest_ctrl',  label: 'Pest Control',        odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
  { code: 'waste_mgmt', label: 'Waste Management',    odoo_plan_hint: '(in Mix Projects)', template_status: 'stub'  },
];
