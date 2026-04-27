-- =====================================================================
-- Beithady CRM — initial-ingest stored procedure
-- =====================================================================
-- One-shot SQL equivalent of the JS syncBeithadyGuests() function in
-- src/lib/beithady/crm/guests-sync.ts. Lets the DB populate
-- beithady_guests on day one without waiting for the daily 30 5 * * *
-- UTC cron tick. The JS sync remains the canonical path going forward;
-- this proc is idempotent (insert ... on conflict do nothing) and safe
-- to re-run if a backfill is needed.
--
-- Currency conversion uses the AED 3.6725 + SAR 3.75 pegs and reads
-- USD→EGP from the fx_rates table (base='USD', quote='EGP'); falls
-- back to 49 EGP/USD if the table is empty.

create or replace function public.beithady_initial_ingest()
returns table (
  guests_from_conversations int,
  guests_from_reservations int,
  total_guests int,
  egp_rate_used numeric
) language plpgsql as $$
declare
  egp_rate numeric;
  ge_count_before int;
  ge_count_after_conv int;
  ge_count_final int;
  run_id uuid;
begin
  insert into public.beithady_crm_sync_runs (trigger, status)
    values ('backfill', 'running') returning id into run_id;

  select rate into egp_rate
    from public.fx_rates
   where base = 'USD' and quote = 'EGP'
   order by rate_date desc
   limit 1;
  if egp_rate is null or egp_rate <= 0 then egp_rate := 49; end if;

  select count(*) into ge_count_before from public.beithady_guests;

  -- Pass 1: insert from conversations keyed by guest_id
  insert into public.beithady_guests (
    guesty_guest_id, full_name, email, phone_e164,
    last_seen, source_signals
  )
  select
    cg.guest_id,
    cg.guest_full_name,
    nullif(lower(cg.guest_email), ''),
    case when cg.guest_phone is not null and length(regexp_replace(cg.guest_phone, '[^0-9]', '', 'g')) >= 8
         then '+' || regexp_replace(cg.guest_phone, '[^0-9]', '', 'g')
         else null end,
    cg.modified_at_guesty,
    jsonb_build_object(
      'has_conversation', true,
      'is_returning_per_guesty', coalesce(cg.guest_is_returning, false),
      'reservation_count', 0,
      'sources', '[]'::jsonb
    )
  from (
    select distinct on (guest_id)
      guest_id, guest_full_name, guest_email, guest_phone,
      guest_is_returning, modified_at_guesty
    from public.guesty_conversations
    where guest_id is not null
    order by guest_id, modified_at_guesty desc nulls last
  ) cg
  on conflict (guesty_guest_id) do nothing;

  select count(*) into ge_count_after_conv from public.beithady_guests;

  -- Pass 2: synthesize guests from reservations not yet matched by
  -- email or phone.
  with norm_res as (
    select
      r.id,
      r.guest_name,
      nullif(lower(r.guest_email), '') as email,
      case when r.guest_phone is not null and length(regexp_replace(r.guest_phone, '[^0-9]', '', 'g')) >= 8
           then '+' || regexp_replace(r.guest_phone, '[^0-9]', '', 'g')
           else null end as phone_e164,
      r.check_in_date
    from public.guesty_reservations r
  ),
  unmatched as (
    select n.*,
           row_number() over (
             partition by coalesce(email, phone_e164, n.id)
             order by check_in_date desc nulls last
           ) as rn
      from norm_res n
     where (n.email is not null or n.phone_e164 is not null)
       and not exists (
         select 1 from public.beithady_guests g
          where (n.email is not null and g.email = n.email)
             or (n.phone_e164 is not null and g.phone_e164 = n.phone_e164)
       )
  )
  insert into public.beithady_guests (
    full_name, email, phone_e164, source_signals
  )
  select
    guest_name,
    email,
    phone_e164,
    jsonb_build_object(
      'has_conversation', false,
      'is_returning_per_guesty', false,
      'reservation_count', 0,
      'sources', '[]'::jsonb
    )
  from unmatched
  where rn = 1;

  -- Pass 3: aggregate reservation stats and patch every guest.
  with norm_res as (
    select
      r.id,
      nullif(lower(r.guest_email), '') as email,
      case when r.guest_phone is not null and length(regexp_replace(r.guest_phone, '[^0-9]', '', 'g')) >= 8
           then '+' || regexp_replace(r.guest_phone, '[^0-9]', '', 'g')
           else null end as phone_e164,
      r.source,
      r.check_in_date,
      r.nights,
      r.host_payout,
      coalesce(upper(r.currency), 'USD') as currency,
      r.status,
      r.raw
    from public.guesty_reservations r
  ),
  res_amounts as (
    select
      n.*,
      case
        when n.currency = 'USD' then n.host_payout
        when n.currency = 'AED' then n.host_payout / 3.6725
        when n.currency = 'SAR' then n.host_payout / 3.75
        when n.currency = 'EGP' then n.host_payout / egp_rate
        else n.host_payout
      end as host_payout_usd,
      (n.status is null or n.status not in ('inquiry','canceled','cancelled','declined')) as counts_as_stay
    from norm_res n
  ),
  joined as (
    select g.id as guest_id, a.*
    from public.beithady_guests g
    join res_amounts a on
      (g.email is not null and a.email = g.email)
      or (g.phone_e164 is not null and a.phone_e164 = g.phone_e164)
  ),
  agg as (
    select
      guest_id,
      count(*) filter (where counts_as_stay) as stays,
      coalesce(sum(nights) filter (where counts_as_stay), 0) as nights_total,
      coalesce(sum(host_payout_usd) filter (where counts_as_stay), 0) as spend_usd,
      min(check_in_date) as first_seen,
      max(check_in_date) as last_seen_res,
      min(check_in_date) filter (where check_in_date >= current_date) as next_arrival,
      array_agg(distinct source) filter (where source is not null) as sources,
      count(*) as res_count,
      coalesce((array_agg(raw order by check_in_date desc nulls last))[1], '{}'::jsonb) as latest_raw
    from joined
    group by guest_id
  )
  update public.beithady_guests g
     set lifetime_stays = a.stays,
         lifetime_nights = a.nights_total,
         lifetime_spend_usd = round(a.spend_usd::numeric, 2),
         first_seen = least(g.first_seen, a.first_seen::timestamptz),
         last_seen = greatest(g.last_seen, a.last_seen_res::timestamptz),
         next_arrival_at = a.next_arrival::timestamptz,
         loyalty_tier = case
           when a.stays >= 10 then 'platinum'
           when a.stays >= 6 then 'gold'
           when a.stays >= 4 then 'silver'
           when a.stays >= 2 then 'bronze'
           else 'none'
         end,
         source_signals = jsonb_set(
           jsonb_set(coalesce(g.source_signals, '{}'::jsonb),
                     '{sources}', coalesce(to_jsonb(a.sources), '[]'::jsonb)),
           '{reservation_count}', to_jsonb(a.res_count)
         ),
         residence_country = coalesce(
           g.residence_country,
           nullif(trim(a.latest_raw#>>'{guest,address,country}'), ''),
           nullif(trim(a.latest_raw#>>'{guest,address,countryCode}'), ''),
           nullif(trim(a.latest_raw#>>'{address,country}'), '')
         )
   from agg a
  where g.id = a.guest_id;

  update public.beithady_guests set vip = true
   where loyalty_tier = 'platinum' and vip = false;

  select count(*) into ge_count_final from public.beithady_guests;

  update public.beithady_crm_sync_runs
     set finished_at = now(),
         status = 'success',
         guests_upserted = (ge_count_final - ge_count_before),
         details = jsonb_build_object(
           'method', 'sql_initial_ingest',
           'egp_rate', egp_rate,
           'guests_before', ge_count_before,
           'guests_after_conv_pass', ge_count_after_conv,
           'guests_final', ge_count_final
         )
   where id = run_id;

  return query select
    (ge_count_after_conv - ge_count_before)::int,
    (ge_count_final - ge_count_after_conv)::int,
    ge_count_final::int,
    egp_rate;
end $$;

-- Audit row recording the function install
insert into public.beithady_audit_log(module, action, metadata) values
  ('crm', 'initial_ingest_proc_installed',
   jsonb_build_object('migration', '0032_beithady_crm_initial_ingest'));
