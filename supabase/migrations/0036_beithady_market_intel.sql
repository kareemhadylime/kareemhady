-- =====================================================================
-- Beithady v2 — Phase G: Market Intelligence + Calendar Heatmap
-- =====================================================================
-- Closes the Phase B gap where residence_country was empty for all
-- 5,753 guests, then layers on outbound (our mix) vs inbound (Egypt
-- national mix) comparison + AI persona briefs per under-indexed
-- country.
--
-- Strategy:
--   1) Phone country-code backfill — instant, universal. E.164 prefix
--      → ISO 3166 alpha-2 via the phone_country_for_e164() function.
--      Covers the major Beithady source markets (EG, SA, AE, KW, QA,
--      GB, DE, FR, IT, RU, US, IN, CN, etc).
--   2) Email TLD backfill — secondary signal for guests with no phone
--      but a country-coded email (.uk, .de, .ru, etc).
--   3) Inbound + signals tables for monthly tourism data and computed
--      under/over-indexed deltas.

-- 1. E.164 → ISO alpha-2 country code lookup. Returns NULL if no match.
-- Order matters: longer prefixes are checked first because some short
-- prefixes (1, 7) span multiple countries.
create or replace function public.phone_country_for_e164(p_e164 text)
returns text language plpgsql immutable as $$
declare
  digits text;
begin
  if p_e164 is null then return null; end if;
  digits := regexp_replace(p_e164, '[^0-9]', '', 'g');
  if length(digits) < 8 then return null; end if;

  -- 4-digit prefixes (Caribbean +1xxx — defer to +1 default)
  -- 3-digit prefixes
  case
    -- Africa
    when digits like '212%' then return 'MA';
    when digits like '213%' then return 'DZ';
    when digits like '216%' then return 'TN';
    when digits like '218%' then return 'LY';
    when digits like '220%' then return 'GM';
    when digits like '221%' then return 'SN';
    when digits like '222%' then return 'MR';
    when digits like '223%' then return 'ML';
    when digits like '224%' then return 'GN';
    when digits like '225%' then return 'CI';
    when digits like '226%' then return 'BF';
    when digits like '227%' then return 'NE';
    when digits like '228%' then return 'TG';
    when digits like '229%' then return 'BJ';
    when digits like '230%' then return 'MU';
    when digits like '231%' then return 'LR';
    when digits like '232%' then return 'SL';
    when digits like '233%' then return 'GH';
    when digits like '234%' then return 'NG';
    when digits like '235%' then return 'TD';
    when digits like '236%' then return 'CF';
    when digits like '237%' then return 'CM';
    when digits like '238%' then return 'CV';
    when digits like '239%' then return 'ST';
    when digits like '240%' then return 'GQ';
    when digits like '241%' then return 'GA';
    when digits like '242%' then return 'CG';
    when digits like '243%' then return 'CD';
    when digits like '244%' then return 'AO';
    when digits like '245%' then return 'GW';
    when digits like '248%' then return 'SC';
    when digits like '249%' then return 'SD';
    when digits like '250%' then return 'RW';
    when digits like '251%' then return 'ET';
    when digits like '252%' then return 'SO';
    when digits like '253%' then return 'DJ';
    when digits like '254%' then return 'KE';
    when digits like '255%' then return 'TZ';
    when digits like '256%' then return 'UG';
    when digits like '257%' then return 'BI';
    when digits like '258%' then return 'MZ';
    when digits like '260%' then return 'ZM';
    when digits like '261%' then return 'MG';
    when digits like '263%' then return 'ZW';
    when digits like '264%' then return 'NA';
    when digits like '265%' then return 'MW';
    when digits like '266%' then return 'LS';
    when digits like '267%' then return 'BW';
    when digits like '268%' then return 'SZ';
    when digits like '269%' then return 'KM';
    -- Middle East
    when digits like '961%' then return 'LB';
    when digits like '962%' then return 'JO';
    when digits like '963%' then return 'SY';
    when digits like '964%' then return 'IQ';
    when digits like '965%' then return 'KW';
    when digits like '966%' then return 'SA';
    when digits like '967%' then return 'YE';
    when digits like '968%' then return 'OM';
    when digits like '970%' then return 'PS';
    when digits like '971%' then return 'AE';
    when digits like '972%' then return 'IL';
    when digits like '973%' then return 'BH';
    when digits like '974%' then return 'QA';
    when digits like '975%' then return 'BT';
    when digits like '976%' then return 'MN';
    when digits like '977%' then return 'NP';
    -- South Asia
    when digits like '880%' then return 'BD';
    when digits like '92%'  then return 'PK';
    when digits like '93%'  then return 'AF';
    when digits like '94%'  then return 'LK';
    when digits like '95%'  then return 'MM';
    when digits like '98%'  then return 'IR';
    -- East Asia / SE Asia
    when digits like '852%' then return 'HK';
    when digits like '853%' then return 'MO';
    when digits like '855%' then return 'KH';
    when digits like '856%' then return 'LA';
    when digits like '880%' then return 'BD';
    when digits like '886%' then return 'TW';
    -- Europe (3-digit)
    when digits like '350%' then return 'GI';
    when digits like '351%' then return 'PT';
    when digits like '352%' then return 'LU';
    when digits like '353%' then return 'IE';
    when digits like '354%' then return 'IS';
    when digits like '355%' then return 'AL';
    when digits like '356%' then return 'MT';
    when digits like '357%' then return 'CY';
    when digits like '358%' then return 'FI';
    when digits like '359%' then return 'BG';
    when digits like '370%' then return 'LT';
    when digits like '371%' then return 'LV';
    when digits like '372%' then return 'EE';
    when digits like '373%' then return 'MD';
    when digits like '374%' then return 'AM';
    when digits like '375%' then return 'BY';
    when digits like '376%' then return 'AD';
    when digits like '377%' then return 'MC';
    when digits like '378%' then return 'SM';
    when digits like '380%' then return 'UA';
    when digits like '381%' then return 'RS';
    when digits like '382%' then return 'ME';
    when digits like '383%' then return 'XK';
    when digits like '385%' then return 'HR';
    when digits like '386%' then return 'SI';
    when digits like '387%' then return 'BA';
    when digits like '389%' then return 'MK';
    when digits like '420%' then return 'CZ';
    when digits like '421%' then return 'SK';
    when digits like '423%' then return 'LI';
    -- Americas (3-digit)
    when digits like '500%' then return 'FK';
    when digits like '501%' then return 'BZ';
    when digits like '502%' then return 'GT';
    when digits like '503%' then return 'SV';
    when digits like '504%' then return 'HN';
    when digits like '505%' then return 'NI';
    when digits like '506%' then return 'CR';
    when digits like '507%' then return 'PA';
    when digits like '509%' then return 'HT';
    when digits like '591%' then return 'BO';
    when digits like '592%' then return 'GY';
    when digits like '593%' then return 'EC';
    when digits like '594%' then return 'GF';
    when digits like '595%' then return 'PY';
    when digits like '597%' then return 'SR';
    when digits like '598%' then return 'UY';
    -- 2-digit (Europe + selected)
    when digits like '20%' then return 'EG';
    when digits like '27%' then return 'ZA';
    when digits like '30%' then return 'GR';
    when digits like '31%' then return 'NL';
    when digits like '32%' then return 'BE';
    when digits like '33%' then return 'FR';
    when digits like '34%' then return 'ES';
    when digits like '36%' then return 'HU';
    when digits like '39%' then return 'IT';
    when digits like '40%' then return 'RO';
    when digits like '41%' then return 'CH';
    when digits like '43%' then return 'AT';
    when digits like '44%' then return 'GB';
    when digits like '45%' then return 'DK';
    when digits like '46%' then return 'SE';
    when digits like '47%' then return 'NO';
    when digits like '48%' then return 'PL';
    when digits like '49%' then return 'DE';
    when digits like '51%' then return 'PE';
    when digits like '52%' then return 'MX';
    when digits like '53%' then return 'CU';
    when digits like '54%' then return 'AR';
    when digits like '55%' then return 'BR';
    when digits like '56%' then return 'CL';
    when digits like '57%' then return 'CO';
    when digits like '58%' then return 'VE';
    when digits like '60%' then return 'MY';
    when digits like '61%' then return 'AU';
    when digits like '62%' then return 'ID';
    when digits like '63%' then return 'PH';
    when digits like '64%' then return 'NZ';
    when digits like '65%' then return 'SG';
    when digits like '66%' then return 'TH';
    when digits like '81%' then return 'JP';
    when digits like '82%' then return 'KR';
    when digits like '84%' then return 'VN';
    when digits like '86%' then return 'CN';
    when digits like '90%' then return 'TR';
    when digits like '91%' then return 'IN';
    -- 1-digit (Russia/Kazakhstan share +7; default to RU; +1 = NANP, default to US)
    when digits like '7%' then return 'RU';
    when digits like '1%' then return 'US';
    else return null;
  end case;
end $$;

-- 2. Email TLD → ISO alpha-2 (used as fallback for guests with no phone)
create or replace function public.email_tld_country(p_email text)
returns text language plpgsql immutable as $$
declare
  tld text;
begin
  if p_email is null or p_email !~ '@' then return null; end if;
  tld := lower(split_part(reverse(split_part(reverse(p_email), '.', 1)), ' ', 1));
  return case tld
    when 'eg' then 'EG'
    when 'sa' then 'SA'
    when 'ae' then 'AE'
    when 'kw' then 'KW'
    when 'qa' then 'QA'
    when 'bh' then 'BH'
    when 'om' then 'OM'
    when 'jo' then 'JO'
    when 'lb' then 'LB'
    when 'uk' then 'GB'
    when 'de' then 'DE'
    when 'fr' then 'FR'
    when 'it' then 'IT'
    when 'es' then 'ES'
    when 'nl' then 'NL'
    when 'ru' then 'RU'
    when 'pl' then 'PL'
    when 'cz' then 'CZ'
    when 'tr' then 'TR'
    when 'ch' then 'CH'
    when 'at' then 'AT'
    when 'be' then 'BE'
    when 'se' then 'SE'
    when 'no' then 'NO'
    when 'dk' then 'DK'
    when 'fi' then 'FI'
    when 'us' then 'US'
    when 'ca' then 'CA'
    when 'au' then 'AU'
    when 'in' then 'IN'
    when 'cn' then 'CN'
    when 'jp' then 'JP'
    when 'kr' then 'KR'
    when 'br' then 'BR'
    when 'mx' then 'MX'
    when 'za' then 'ZA'
    else null
  end;
end $$;

-- 3. One-shot backfill — runs against existing guests + provides a
--    re-runnable function for future use.
create or replace function public.beithady_backfill_residence_country()
returns table (
  guests_total int,
  before_count int,
  after_count int,
  by_phone int,
  by_email int
) language plpgsql as $$
declare
  total int;
  before_c int;
  after_c int;
  by_p int;
  by_e int;
begin
  select count(*) into total from public.beithady_guests;
  select count(*) into before_c from public.beithady_guests where residence_country is not null;

  -- Phone country first (most reliable signal)
  with patches as (
    update public.beithady_guests g
       set residence_country = public.phone_country_for_e164(g.phone_e164)
     where g.residence_country is null
       and g.phone_e164 is not null
       and public.phone_country_for_e164(g.phone_e164) is not null
    returning 1
  )
  select count(*) into by_p from patches;

  -- Email TLD next (fills the gap when phone is missing)
  with patches2 as (
    update public.beithady_guests g
       set residence_country = public.email_tld_country(g.email)
     where g.residence_country is null
       and g.email is not null
       and public.email_tld_country(g.email) is not null
    returning 1
  )
  select count(*) into by_e from patches2;

  select count(*) into after_c from public.beithady_guests where residence_country is not null;
  return query select total, before_c, after_c, by_p, by_e;
end $$;

-- 4. Inbound (Egypt national tourism mix) — populated monthly. For
-- Phase G v1 we seed a hardcoded baseline approximating 2024 numbers
-- so signals work day one without external scraping. The cron stub
-- can later refresh from CAPMAS/UN Tourism scrapers.
create table if not exists public.beithady_market_inbound (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  period_year     int not null,
  period_month    int,
  origin_country  text not null,
  visitor_count   bigint,
  share_pct       numeric(6,2),
  growth_yoy_pct  numeric(6,2),
  raw             jsonb,
  fetched_at      timestamptz not null default now(),
  unique (source, period_year, period_month, origin_country)
);
create index if not exists idx_bh_inbound_period on public.beithady_market_inbound(period_year, period_month);

-- 5. Signals (computed) — under_indexed | over_indexed | rising
create table if not exists public.beithady_market_signals (
  id              uuid primary key default gen_random_uuid(),
  signal_type     text not null,
  origin_country  text not null,
  our_share_pct   numeric(6,2),
  egypt_share_pct numeric(6,2),
  delta_pct       numeric(6,2),
  ai_persona      text,
  ai_persona_lang text,
  ai_persona_at   timestamptz,
  computed_at     timestamptz not null default now()
);
create index if not exists idx_bh_signals_country on public.beithady_market_signals(origin_country);
create index if not exists idx_bh_signals_type on public.beithady_market_signals(signal_type, computed_at desc);

-- 6. Seed 2024 Egypt national tourism mix (approximate top sources +
--    estimated share). Numbers based on 2024 industry reports for
--    Egypt's ~14M international visitors. Will be replaced by live
--    feed when the CAPMAS scraper lands.
insert into public.beithady_market_inbound(source, period_year, period_month, origin_country, share_pct, visitor_count) values
  ('seed_2024', 2024, null, 'DE',  9.5,  1330000),
  ('seed_2024', 2024, null, 'GB',  8.1,  1134000),
  ('seed_2024', 2024, null, 'IT',  7.4,  1036000),
  ('seed_2024', 2024, null, 'RU',  6.8,   952000),
  ('seed_2024', 2024, null, 'PL',  4.7,   658000),
  ('seed_2024', 2024, null, 'SA',  4.5,   630000),
  ('seed_2024', 2024, null, 'CZ',  3.9,   546000),
  ('seed_2024', 2024, null, 'FR',  3.6,   504000),
  ('seed_2024', 2024, null, 'CN',  2.8,   392000),
  ('seed_2024', 2024, null, 'NL',  2.6,   364000),
  ('seed_2024', 2024, null, 'AE',  2.5,   350000),
  ('seed_2024', 2024, null, 'US',  2.4,   336000),
  ('seed_2024', 2024, null, 'BE',  2.2,   308000),
  ('seed_2024', 2024, null, 'KW',  2.1,   294000),
  ('seed_2024', 2024, null, 'AT',  1.9,   266000),
  ('seed_2024', 2024, null, 'IN',  1.7,   238000),
  ('seed_2024', 2024, null, 'ES',  1.6,   224000),
  ('seed_2024', 2024, null, 'JO',  1.5,   210000),
  ('seed_2024', 2024, null, 'TR',  1.4,   196000),
  ('seed_2024', 2024, null, 'ES',  1.3,   182000)
on conflict (source, period_year, period_month, origin_country) do nothing;

-- 7. Compute signals — outbound = beithady_guests share by country,
--    inbound = baseline above, signal = under_indexed if our < egypt × 0.7,
--    over_indexed if our > egypt × 1.5, rising stub for now.
create or replace function public.beithady_compute_market_signals()
returns int language plpgsql as $$
declare
  affected int;
  total_our int;
begin
  select count(*) into total_our from public.beithady_guests where residence_country is not null;
  if total_our < 50 then return 0; end if; -- not enough data yet

  delete from public.beithady_market_signals;

  with our_mix as (
    select residence_country as country,
           count(*) as cnt,
           round(100.0 * count(*) / total_our::numeric, 2) as share_pct
      from public.beithady_guests
     where residence_country is not null
     group by residence_country
  ),
  egypt_mix as (
    select origin_country as country, share_pct
      from public.beithady_market_inbound
     where source = 'seed_2024'
  ),
  combined as (
    select
      coalesce(o.country, e.country) as country,
      coalesce(o.share_pct, 0::numeric) as our_pct,
      coalesce(e.share_pct, 0::numeric) as egypt_pct
    from our_mix o
    full outer join egypt_mix e on e.country = o.country
  )
  insert into public.beithady_market_signals (signal_type, origin_country, our_share_pct, egypt_share_pct, delta_pct)
  select
    case
      when egypt_pct > 0 and our_pct < egypt_pct * 0.7 then 'under_indexed'
      when egypt_pct > 0 and our_pct > egypt_pct * 1.5 then 'over_indexed'
      when our_pct > 0 and egypt_pct = 0 then 'unique_to_us'
      else 'aligned'
    end,
    country,
    our_pct,
    egypt_pct,
    case when egypt_pct = 0 then null else round(our_pct - egypt_pct, 2) end
  from combined
  where our_pct > 0 or egypt_pct > 0;

  get diagnostics affected = row_count;
  return affected;
end $$;

insert into public.beithady_audit_log(module, action, metadata) values
  ('communication', 'phase_g_installed',
   jsonb_build_object('migration', '0036_beithady_market_intel', 'phase', 'G'));
