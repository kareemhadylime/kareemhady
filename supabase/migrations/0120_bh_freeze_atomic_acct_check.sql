-- 0120_bh_freeze_atomic_acct_check.sql
-- Move the "≥1 account row" precondition from the TS wrapper into the
-- bh_freeze_snapshot RPC so it's checked atomically with the freeze
-- transaction. Closes the I2 race window where another caller could
-- delete account rows between the TS check and the RPC call.

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
  v_acct_count int;
begin
  select * into v_snap from public.bh_balance_snapshots where id = p_snapshot_id for update;
  if not found then
    raise exception 'snapshot % not found', p_snapshot_id;
  end if;
  if v_snap.status <> 'draft' then
    raise exception 'snapshot % is not draft (status=%)', p_snapshot_id, v_snap.status;
  end if;

  -- Inside-transaction precondition: at least one account row must exist.
  select count(*) into v_acct_count
    from public.bh_balance_snapshot_accounts
    where snapshot_id = p_snapshot_id;
  if v_acct_count = 0 then
    raise exception 'snapshot % has no account-level rows; cannot freeze', p_snapshot_id;
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
