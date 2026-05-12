// src/lib/beithady/financials/types.ts
// Shared types for the BH Financials balance-snapshot module. Keep in sync
// with supabase/migrations/0118_bh_financials_balance_snapshots.sql.

export type CompanyScope = 'consolidated' | 'egypt' | 'dubai' | 'a1';
export type SnapshotStatus = 'draft' | 'frozen' | 'superseded';
export type SnapshotSourceKind = 'xlsx_import' | 'odoo_snapshot' | 'manual_edit';
export type PartnerKind =
  | 'supplier'
  | 'owner'
  | 'customer'
  | 'employee'
  | 'landlord'
  | 'noteholder'
  | 'unallocated';
export type MatchConfidence = 'exact' | 'fuzzy' | 'unmatched' | 'synthetic';
export type VarianceStatus = 'open' | 'investigating' | 'accepted' | 'resolved';
export type ParseStatus =
  | 'pending'
  | 'parsed'
  | 'committed'
  | 'failed'
  | 'rejected';

export type BhBalanceSnapshot = {
  id: string;
  period_end: string; // YYYY-MM-DD
  company_scope: CompanyScope;
  version: number;
  status: SnapshotStatus;
  frozen_at: string | null;
  frozen_by: string | null;
  source_kind: SnapshotSourceKind;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BhSnapshotAccount = {
  id: string;
  snapshot_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_type_override: string | null;
  opening_raw: number;
  partner_total: number | null;
  variance: number;
  variance_status: VarianceStatus;
  variance_notes: string | null;
};

export type BhSnapshotPartner = {
  id: string;
  snapshot_id: string;
  account_code: string;
  partner_kind: PartnerKind;
  partner_id: number | null;
  partner_name_raw: string;
  partner_name_normalized: string | null;
  opening_balance: number;
  currency: string;
  is_synthetic: boolean;
  match_confidence: MatchConfidence | null;
  match_score: number | null;
  match_warnings: string[];
};

export type BhSnapshotUpload = {
  id: string;
  snapshot_id: string | null;
  account_code: string | null;
  period_end: string | null;
  company_scope: CompanyScope | null;
  filename: string;
  file_sha256: string;
  storage_path: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  raw_row_count: number | null;
  parsed_partner_count: number | null;
  parse_status: ParseStatus;
  parse_errors: Array<{ row: number; error: string }>;
  raw_rows: unknown;
  classified_rows: unknown;
};

export type BhFinancialsReminder = {
  id: string;
  period_end: string;
  company_scope: CompanyScope;
  first_seen_at: string;
  last_seen_at: string;
  dismissed_until: string | null;
  resolved_at: string | null;
  notification_sent_at: Record<string, string>;
};
