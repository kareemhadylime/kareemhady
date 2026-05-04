-- Phase: FM+ Project Budget v2 RLS & Permission Gates
-- Enforces data isolation per contract via created_by field
-- Cascades access control through dependent tables via foreign keys
-- See docs/superpowers/specs/2026-05-04-fmplus-project-budget-v2-design.md

-- =====================================================================
-- 1. ENABLE RLS ON ALL BUDGET V2 TABLES
-- =====================================================================

alter table public.project_contracts            enable row level security;
alter table public.project_services             enable row level security;
alter table public.project_years                enable row level security;
alter table public.project_year_services        enable row level security;
alter table public.fmplus_catalog               enable row level security;
alter table public.project_catalog_overrides    enable row level security;
alter table public.budget_lines                 enable row level security;
alter table public.mobilization_lines           enable row level security;
alter table public.budget_audit                 enable row level security;
alter table public.budget_settings              enable row level security;

-- =====================================================================
-- 2. PROJECT_CONTRACTS — User can read/write their own contracts
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_contracts' and policyname='project_contracts_read') then
    create policy project_contracts_read on public.project_contracts for select
      using (created_by = auth.uid() or created_by is null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_contracts' and policyname='project_contracts_write') then
    create policy project_contracts_write on public.project_contracts for insert
      with check (auth.uid() is not null);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_contracts' and policyname='project_contracts_update') then
    create policy project_contracts_update on public.project_contracts for update
      using (created_by = auth.uid())
      with check (created_by = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_contracts' and policyname='project_contracts_delete') then
    create policy project_contracts_delete on public.project_contracts for delete
      using (created_by = auth.uid());
  end if;
end $$;

-- =====================================================================
-- 3. PROJECT_SERVICES — Cascade through contract access
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_services' and policyname='project_services_all') then
    create policy project_services_all on public.project_services for all
      using (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      )
      with check (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 4. PROJECT_YEARS — Cascade through contract access
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_years' and policyname='project_years_all') then
    create policy project_years_all on public.project_years for all
      using (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      )
      with check (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 5. PROJECT_YEAR_SERVICES — Cascade through year → contract
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_year_services' and policyname='project_year_services_all') then
    create policy project_year_services_all on public.project_year_services for all
      using (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid()
        )
      )
      with check (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 6. FMPLUS_CATALOG — Global read (all users); write by admin
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fmplus_catalog' and policyname='fmplus_catalog_read') then
    create policy fmplus_catalog_read on public.fmplus_catalog for select
      using (true);
  end if;
end $$;

-- Catalog write restricted to service role (auth.uid() = NULL in service context)
-- This is enforced at the application layer; RLS allows admin updates via service role
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fmplus_catalog' and policyname='fmplus_catalog_write') then
    create policy fmplus_catalog_write on public.fmplus_catalog for all
      using (
        -- Service role (admin/cron) can write; regular users cannot
        auth.uid() is null or
        -- Optional: allow future "catalog admin" role here
        exists (select 1 from public.accounts where id = auth.uid() and provider = 'admin')
      )
      with check (
        auth.uid() is null or
        exists (select 1 from public.accounts where id = auth.uid() and provider = 'admin')
      );
  end if;
end $$;

-- =====================================================================
-- 7. PROJECT_CATALOG_OVERRIDES — Cascade through contract access
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_catalog_overrides' and policyname='project_catalog_overrides_all') then
    create policy project_catalog_overrides_all on public.project_catalog_overrides for all
      using (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      )
      with check (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 8. BUDGET_LINES — Cascade through year → contract
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budget_lines' and policyname='budget_lines_all') then
    create policy budget_lines_all on public.budget_lines for all
      using (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid()
        )
      )
      with check (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 9. MOBILIZATION_LINES — Cascade through contract access
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mobilization_lines' and policyname='mobilization_lines_all') then
    create policy mobilization_lines_all on public.mobilization_lines for all
      using (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      )
      with check (
        contract_id in (
          select id from public.project_contracts
            where created_by = auth.uid()
        )
      );
  end if;
end $$;

-- =====================================================================
-- 10. BUDGET_AUDIT — Cascade through year → contract
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budget_audit' and policyname='budget_audit_read') then
    create policy budget_audit_read on public.budget_audit for select
      using (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid()
        )
      );
  end if;
end $$;

-- Audit inserts (triggered by the system)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budget_audit' and policyname='budget_audit_insert') then
    create policy budget_audit_insert on public.budget_audit for insert
      with check (
        year_id in (
          select py.id from public.project_years py
            join public.project_contracts pc on pc.id = py.contract_id
            where pc.created_by = auth.uid() or auth.uid() is null
        )
      );
  end if;
end $$;

-- =====================================================================
-- 11. BUDGET_SETTINGS — Singleton; global read, admin write
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budget_settings' and policyname='budget_settings_read') then
    create policy budget_settings_read on public.budget_settings for select
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='budget_settings' and policyname='budget_settings_write') then
    create policy budget_settings_write on public.budget_settings for all
      using (auth.uid() is null)
      with check (auth.uid() is null);
  end if;
end $$;

-- =====================================================================
-- 12. PERMISSION GATE FUNCTIONS (Application-level helpers)
-- =====================================================================

create or replace function public.budget_can_edit_contract(
  p_contract_id bigint
) returns boolean as $$
declare
  v_created_by uuid;
begin
  select created_by into v_created_by
    from public.project_contracts
    where id = p_contract_id;

  return v_created_by = auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.budget_can_view_contract(
  p_contract_id bigint
) returns boolean as $$
declare
  v_created_by uuid;
begin
  select created_by into v_created_by
    from public.project_contracts
    where id = p_contract_id;

  return v_created_by = auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.budget_can_edit_year(
  p_year_id bigint
) returns boolean as $$
declare
  v_created_by uuid;
begin
  select pc.created_by into v_created_by
    from public.project_years py
    join public.project_contracts pc on pc.id = py.contract_id
    where py.id = p_year_id;

  return v_created_by = auth.uid();
end;
$$ language plpgsql security definer;

create or replace function public.budget_user_contracts()
returns table (
  id bigint,
  project_id bigint,
  name text,
  customer text,
  contract_value numeric,
  year_tracking text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
) as $$
begin
  return query
    select
      pc.id,
      pc.project_id,
      pc.name,
      pc.customer,
      pc.contract_value,
      pc.year_tracking,
      pc.created_by,
      pc.created_at,
      pc.updated_at
    from public.project_contracts pc
    where pc.created_by = auth.uid();
end;
$$ language plpgsql security definer;

-- =====================================================================
-- 13. AUDIT LOG INTEGRATION
-- =====================================================================

insert into public.beithady_audit_log(module, action, metadata) values
  ('fmplus', 'budget_v2_rls_installed',
   jsonb_build_object(
     'migration', '0082_fmplus_budget_v2_rls',
     'tables_secured', 10,
     'policy_pattern', 'contract-owner-isolation',
     'cascade_depth', 'contract → year/service/audit → line'
   )
  );
