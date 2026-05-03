// src/lib/fmplus/classifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyByPrefix } from './classifier';

describe('classifyByPrefix', () => {
  describe('service-line costs (5xxxxx)', () => {
    it('classifies HK Headcount (500001) into hk/headcount', () => {
      const r = classifyByPrefix('500001', 'Basic Salary Hk', 'expense_direct_cost');
      expect(r).toEqual({
        section: 'cost_of_revenue',
        service: 'hk',
        serviceLabel: 'Cost of Housekeeping',
        subgroupKey: 'headcount',
        subgroupLabel: 'HK - Headcount Cost',
        flip: false,
      });
    });
    it('classifies HK Tools/Equipment Depreciation (500201) into hk/tools', () => {
      const r = classifyByPrefix('500201', 'Depreciation - Equipment Hk', 'expense_direct_cost');
      expect(r?.service).toBe('hk');
      expect(r?.subgroupKey).toBe('tools');
      expect(r?.isDepreciation).toBe(true); // flag for no-dep toggle
    });
    it('classifies MEP Subcontractors (510601) into mep/subcontractors', () => {
      const r = classifyByPrefix('510601', 'Subcontractor MEP', 'expense_direct_cost');
      expect(r?.service).toBe('mep');
      expect(r?.subgroupKey).toBe('subcontractors');
    });
    it('classifies Security Penalties (521001) into security/penalties', () => {
      const r = classifyByPrefix('521001', 'Penalty Security', 'expense_direct_cost');
      expect(r?.service).toBe('security');
      expect(r?.subgroupKey).toBe('penalties');
    });
    it('classifies all 8 service prefixes', () => {
      const services: Array<[string, string]> = [
        ['500101', 'hk'], ['510101', 'mep'], ['520101', 'security'],
        ['530101', 'landscape'], ['540101', 'pest'], ['550101', 'waste'],
        ['560101', 'paid'], ['570101', 'vo'],
      ];
      for (const [code, expected] of services) {
        expect(classifyByPrefix(code, 'x', 'expense_direct_cost')?.service).toBe(expected);
      }
    });
  });

  describe('G&A (600-606)', () => {
    it('classifies 600001 into back_office', () => {
      const r = classifyByPrefix('600001', 'Basic Salary BO', 'expense');
      expect(r?.section).toBe('general_expenses');
      expect(r?.subgroupKey).toBe('back_office');
    });
    it('classifies 601001 into office_rent', () => {
      const r = classifyByPrefix('601001', 'Rent', 'expense');
      expect(r?.subgroupKey).toBe('office_rent');
    });
    it('classifies 602001 into transport_ga', () => {
      expect(classifyByPrefix('602001', 'x', 'expense')?.subgroupKey).toBe('transport_ga');
    });
    it('classifies 603001 into marketing', () => {
      expect(classifyByPrefix('603001', 'x', 'expense')?.subgroupKey).toBe('marketing');
    });
    it('classifies 604001 into legal_financial', () => {
      expect(classifyByPrefix('604001', 'x', 'expense')?.subgroupKey).toBe('legal_financial');
    });
    it('classifies 605001 and 606001 into other_ga', () => {
      expect(classifyByPrefix('605001', 'x', 'expense')?.subgroupKey).toBe('other_ga');
      expect(classifyByPrefix('606001', 'x', 'expense')?.subgroupKey).toBe('other_ga');
    });
  });

  describe('interest / depreciation (607-609)', () => {
    it('classifies 607001 into interest', () => {
      const r = classifyByPrefix('607001', 'Interest', 'expense');
      expect(r?.section).toBe('interest_tax_dep');
      expect(r?.subgroupKey).toBe('interest');
    });
    it('classifies 608001 and 609001 into depreciation', () => {
      expect(classifyByPrefix('608001', 'x', 'expense_depreciation')?.subgroupKey).toBe('depreciation');
      expect(classifyByPrefix('609001', 'x', 'expense_depreciation')?.subgroupKey).toBe('depreciation');
    });
  });

  describe('revenue', () => {
    it('classifies income with HK keyword as hk service revenue', () => {
      const r = classifyByPrefix('400001', 'House Keeping Revenue', 'income');
      expect(r?.section).toBe('revenue');
      expect(r?.service).toBe('hk');
      expect(r?.flip).toBe(true);
    });
    it('classifies income_other as other revenue', () => {
      const r = classifyByPrefix('410001', 'Bank Interest Income', 'income_other');
      expect(r?.section).toBe('revenue');
      expect(r?.subgroupKey).toBe('other_revenue');
      expect(r?.flip).toBe(true);
    });
  });

  describe('balance-sheet types', () => {
    it('returns null for asset_cash (not P&L)', () => {
      expect(classifyByPrefix('123001', 'Cash', 'asset_cash')).toBeNull();
    });
    it('returns null for liability_payable', () => {
      expect(classifyByPrefix('221001', 'Trade Payables', 'liability_payable')).toBeNull();
    });
  });

  describe('unclassified', () => {
    it('returns null for prefix outside the table (e.g. 700xxx)', () => {
      expect(classifyByPrefix('700001', 'mystery', 'expense')).toBeNull();
    });
  });
});
