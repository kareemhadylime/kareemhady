-- 0119_bh_freeze_rpcs.sql
-- Stored functions for atomic snapshot freeze + re-freeze clone.
-- Also adds CHECK constraints + integrity guards deferred from Task 1 review.

-- Constraint 1: lock down account_type / account_type_override enums.
alter table public.bh_balance_snapshot_accounts
  add constraint chk_bh_acct_type check (
    account_type in (
      'asset_cash','asset_receivable','asset_current','asset_prepayments',
      'asset_fixed','liability_current','liability_payable',
      'liability_non_current','equity','equity_unaffected'
    )
  );
alter table public.bh_balance_snapshot_accounts
  add constraint chk_bh_acct_type_override check (
    account_type_override is null or account_type_override in (
      'asset_cash','asset_receivable','asset_current','asset_prepayments',
      'asset_fixed','liability_current','liability_payable',
      'liability_non_current','equity','equity_unaffected'
    )
  );

-- Constraint 2: an upload marked 'committed' MUST have a snapshot_id.
alter table public.bh_balance_snapshot_uploads
  add constraint chk_bh_upload_committed_has_snapshot
  check (parse_status <> 'committed' or snapshot_id is not null);

-- Constraint 3: align company_scope on reminders with the snapshots table.
alter table public.bh_financials_reminders
  add constraint chk_bh_reminders_scope
  check (company_scope in ('consolidated','egypt','dubai','a1'));

create or replace function public.bh_freeze_snapshot(
  p_snapshot_id uuid,
  p_user_id uuid
) returns public.bh_balance_snapshots
language plpgsql
as $$
declare
  v_snap public.bh_balance_snapshots;
  v_period date;
  v_scope text;
begin
  select * into v_snap from public.bh_balance_snapshots where id = p_snapshot_id for update;
  if not found then
    raise exception 'snapshot % not found', p_snapshot_id;
  end if;
  if v_snap.status <> 'draft' then
    raise exception 'snapshot % is not draft (status=%)', p_snapshot_id, v_snap.status;
  end if;
  v_period := v_snap.period_end;
  v_scope := v_snap.company_scope;

  -- Mark prior frozen version as superseded.
  update public.bh_balance_snapshots
  set status = 'superseded', updated_at = now()
  where period_end = v_period
    and company_scope = v_scope
    and status = 'frozen';

  -- Promote draft to frozen.
  update public.bh_balance_snapshots
  set status = 'frozen',
      frozen_at = now(),
      frozen_by = p_user_id,
      updated_at = now()
  where id = p_snapshot_id
  returning * into v_snap;

  -- Resolve any cron reminder for this (period, scope).
  update public.bh_financials_reminders
  set resolved_at = now()
  where period_end = v_period and company_scope = v_scope and resolved_at is null;

  return v_snap;
end;
$$;

create or replace function public.bh_clone_snapshot_for_refreeze(
  p_source_snapshot_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_src public.bh_balance_snapshots;
  v_new_id uuid := gen_random_uuid();
  v_new_version int;
begin
  select * into v_src from public.bh_balance_snapshots where id = p_source_snapshot_id;
  if not found then
    raise exception 'source snapshot % not found', p_source_snapshot_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_new_version
  from public.bh_balance_snapshots
  where period_end = v_src.period_end and company_scope = v_src.company_scope;

  insert into public.bh_balance_snapshots
    (id, period_end, company_scope, version, status, source_kind, notes)
  values
    (v_new_id, v_src.period_end, v_src.company_scope, v_new_version, 'draft',
     'manual_edit',
     'Re-freeze draft cloned from snapshot ' || p_source_snapshot_id::text);

  insert into public.bh_balance_snapshot_accounts
    (snapshot_id, account_code, account_name, account_type, account_type_override,
     opening_raw, partner_total, variance_status, variance_notes)
  select v_new_id, account_code, account_name, account_type, account_type_override,
         opening_raw, partner_total, variance_status, variance_notes
  from public.bh_balance_snapshot_accounts where snapshot_id = p_source_snapshot_id;

  insert into public.bh_balance_snapshot_partners
    (snapshot_id, account_code, partner_kind, partner_id, partner_name_raw,
     partner_name_normalized, opening_balance, currency, is_synthetic,
     match_confidence, match_score, match_warnings)
  select v_new_id, account_code, partner_kind, partner_id, partner_name_raw,
         partner_name_normalized, opening_balance, currency, is_synthetic,
         match_confidence, match_score, match_warnings
  from public.bh_balance_snapshot_partners where snapshot_id = p_source_snapshot_id;

  return jsonb_build_object('new_snapshot_id', v_new_id, 'new_version', v_new_version);
end;
$$;
