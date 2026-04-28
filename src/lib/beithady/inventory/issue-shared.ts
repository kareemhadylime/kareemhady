// Shared types + label constants for the inventory issue module.
// Lives in its own file (no `server-only` import) so client components
// can pull constants and types without dragging in the supabase admin
// client. Server-side queries live in ./issue.ts.

export type IssueStatus = 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'posted' | 'rejected';
export type IssueType = 'per_reservation' | 'maintenance_task' | 'welcome_tray' | 'owner_request' | 'damage_writeoff' | 'transfer_out';
export type IssueCreatedVia = 'manual' | 'auto_rule' | 'mobile_pin' | 'wa_inbound';

export const ISSUE_TYPE_LABEL: Record<IssueType, { en: string; tone: string }> = {
  per_reservation: { en: 'Per reservation', tone: 'bg-cyan-50 text-cyan-700' },
  maintenance_task: { en: 'Maintenance', tone: 'bg-amber-50 text-amber-700' },
  welcome_tray: { en: 'Welcome tray', tone: 'bg-emerald-50 text-emerald-700' },
  owner_request: { en: 'Owner request', tone: 'bg-violet-50 text-violet-700' },
  damage_writeoff: { en: 'Damage write-off', tone: 'bg-rose-50 text-rose-700' },
  transfer_out: { en: 'Transfer out', tone: 'bg-slate-100 text-slate-700' },
};

export const ISSUE_STATUS_LABEL: Record<IssueStatus, { en: string; tone: string }> = {
  draft: { en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  submitted: { en: 'Submitted', tone: 'bg-cyan-50 text-cyan-700' },
  pending_approval: { en: 'Pending approval', tone: 'bg-amber-50 text-amber-700' },
  approved: { en: 'Approved', tone: 'bg-violet-50 text-violet-700' },
  posted: { en: 'Posted', tone: 'bg-emerald-50 text-emerald-700' },
  rejected: { en: 'Rejected', tone: 'bg-rose-50 text-rose-700' },
};

export type IssueRow = {
  id: string;
  issue_no: string;
  status: IssueStatus;
  type: IssueType;
  warehouse_id: string;
  ref_reservation_id: string | null;
  ref_task_id: string | null;
  ref_owner: string | null;
  ref_kit_id: string | null;
  ref_transfer_id: string | null;
  sub_total_egp: number;
  notes: string | null;
  photo_url: string | null;
  approver_user: string | null;
  approved_at: string | null;
  posted_at: string | null;
  rejected_reason: string | null;
  created_by_user: string | null;
  created_via: IssueCreatedVia;
  cleaner_session_name: string | null;
  created_at: string;
};

export type IssueLine = {
  id: string;
  issue_id: string;
  line_no: number;
  item_id: string;
  qty: number;
  batch_no_picked: string;
  unit_cost_egp: number;
  note: string | null;
};

export type IssueListRow = IssueRow & {
  warehouse_code: string;
  warehouse_name: string;
  line_count: number;
};

export type IssueDetail = IssueRow & {
  warehouse_code: string;
  warehouse_name: string;
  warehouse_building: string | null;
  lines: Array<IssueLine & { item_sku: string; item_name_en: string; item_name_ar: string; item_uom: string }>;
  required_approvers: string[];
  computed_total_egp: number;
};

export type IssueFilters = {
  status?: IssueStatus | 'all';
  type?: IssueType | 'all';
  warehouseId?: string;
  search?: string;
};
