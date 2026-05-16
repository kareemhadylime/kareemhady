-- 0144_personal_stock_investing_url.sql
-- Adds a per-instrument investing.com equities-page URL so the
-- /api/cron/personal-stock-prices cron can scrape a stable price
-- element (data-test="instrument-price-last") from one known page
-- per held EGX position. Held instruments without an investing_url
-- are skipped by the cron with an error noted in the response.

ALTER TABLE personal_stock_instruments
  ADD COLUMN IF NOT EXISTS investing_url TEXT NULL;

UPDATE personal_stock_instruments
SET investing_url = 'https://www.investing.com/equities/act-financial'
WHERE ticker = 'ACT_FINANCIAL_CONSULTING';

UPDATE personal_stock_instruments
SET investing_url = 'https://www.investing.com/equities/beltone-financial-holding'
WHERE ticker = 'BELTONE_FINANCIAL_HOLDING';
