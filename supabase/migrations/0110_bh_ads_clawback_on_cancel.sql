alter table public.ads_leads add column if not exists clawback_reservation_id text;
alter table public.ads_leads add column if not exists clawback_at             timestamptz;

create or replace function public.beithady_ads_clawback_on_cancel()
returns trigger language plpgsql as $$
declare
  evt_id text;
begin
  if (new.status is not distinct from old.status)
     and (new.cancelled_at is not distinct from old.cancelled_at) then
    return new;
  end if;
  if (new.cancelled_at is null) and (new.status not in ('canceled','cancelled','declined')) then
    return new;
  end if;

  update public.ads_leads
     set clawback_reservation_id = matched_reservation_id,
         clawback_at = now(),
         matched_reservation_id = null,
         matched_at = null
   where matched_reservation_id = new.id;

  for evt_id in
    select 'lead_' || l.id || '_clawback_' || extract(epoch from now())::bigint
      from public.ads_leads l
     where l.clawback_reservation_id = new.id
       and l.clawback_at >= now() - interval '1 minute'
  loop
    insert into public.ads_conversion_events_log
      (lead_id, reservation_id, platform, event_type, event_id, event_time, value_usd, currency)
    select l.id, new.id, l.platform, 'Purchase', evt_id, now(), 0, 'USD'
      from public.ads_leads l
     where l.clawback_reservation_id = new.id
       and l.clawback_at >= now() - interval '1 minute'
    on conflict (platform, event_id) do nothing;
  end loop;

  return new;
end $$;

drop trigger if exists trg_ads_clawback_on_cancel on public.guesty_reservations;
create trigger trg_ads_clawback_on_cancel
  after update on public.guesty_reservations
  for each row execute function public.beithady_ads_clawback_on_cancel();

insert into public.beithady_audit_log(module, action, metadata) values
  ('ads', 'clawback_trigger_installed',
   jsonb_build_object('migration', '0110_bh_ads_clawback_on_cancel'));
