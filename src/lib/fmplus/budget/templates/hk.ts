// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import type { TemplateSchemaJsonT, AccountMapJsonT } from '../schema';

export const HK_V1_SCHEMA: TemplateSchemaJsonT = {
  sub_locations_enabled: true,
  default_sub_locations: [
    'NC Inner Campus',
    'Outer Campus',
    'NC Off-Campus Housing',
    'Maadi Buildings',
  ],
  season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  vat_pct: 14,
  categories: [
    { code: 'manning', label: 'Manning', calc: 'qty_x_unitcost', lines: [
      { code: 'hk_manager',    label: 'HK Manager' },
      { code: 'asst_manager',  label: 'Assistant Manager' },
      { code: 'sr_supervisor', label: 'Senior Supervisor' },
      { code: 'sup_8h',        label: 'Supervisor 8H' },
      { code: 'hk_mf_8h',      label: 'HK Male & Female 8H' },
      { code: 'facades_sup',   label: 'Facades Supervisor 8H' },
      { code: 'facades_lab',   label: 'Facades Labor 8H' },
      { code: 'waste_sup',     label: 'Waste Supervisor 8H' },
      { code: 'waste_lab',     label: 'Waste Labor 8H' },
      { code: 'admin',         label: 'Admin' },
      { code: 'storekeeper',   label: 'Storekeeper' },
      { code: 'driver',        label: 'Driver' },
      { code: 'trainer',       label: 'Trainer' },
      { code: 'sup_8h_r',      label: 'Supervisor 8H R' },
      { code: 'hk_f_8h_r',     label: 'HK Female 8H R' },
    ] },
    { code: 'ppe', label: 'Uniform & PPE', calc: 'total_headcount_x_unitcost',
      lines: [{ code: 'uniform_ppe', label: 'Uniform & PPE' }] },
    { code: 'tools', label: 'Tools & Consumables', calc: 'qty_x_unitcost_div_depreciation', lines: [
      { code: 'machinery',   label: 'Machinery' },
      { code: 'tools',       label: 'Tools' },
      { code: 'consumables', label: 'Consumables' },
    ] },
    { code: 'transport', label: 'Transportation & Vehicles', calc: 'qty_x_unitcost', lines: [
      { code: 'bus',      label: 'Bus' },
      { code: 'microbus', label: 'Microbus' },
      { code: 'sedan',    label: 'Sedan Car' },
      { code: 'minivan',  label: 'Minivan' },
      { code: 'pickup',   label: 'Pickup Car' },
      { code: 'fuel',     label: 'Fuel' },
    ] },
    { code: 'it', label: 'IT & Communication', calc: 'qty_x_unitcost',
      lines: [{ code: 'ict_per_head', label: 'Laptop / Mobile / Printer / SIM (per head)' }] },
    { code: 'overhead', label: 'Mobilization & Overhead', calc: 'flat',
      lines: [{ code: 'mob_overhead', label: 'Mobilization & Overhead' }] },
  ],
};

export const HK_V1_ACCOUNT_MAP: AccountMapJsonT = [
  { category: 'manning',     code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
  { category: 'ppe',         code_patterns: ['^500011$'] },
  { category: 'tools',       code_patterns: ['^5002(0[1-9]|1[0-9])$'] },
  { category: 'consumables', code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
  { category: 'transport',   code_patterns: ['^5005[0-9]{2}$'] },
  { category: 'it',          code_patterns: ['^5003(0[1-9]|1[0-9])$'] },
  { category: 'overhead',    code_patterns: ['^5004(0[1-9]|1[0-9])$'] },
];
