-- 0145_personal_stock_price_url_rename.sql
-- investing.com returns HTTP 403 from cloud-provider IPs (verified on
-- Vercel), so the daily cron switches to Mubasher (english.mubasher.info)
-- which is served from Egypt and serves cleanly from Vercel. Renaming
-- the column to source-neutral `price_url` so it doesn't lie if we
-- swap sources again later. Selector enforced in the handler.

ALTER TABLE personal_stock_instruments
  RENAME COLUMN investing_url TO price_url;

UPDATE personal_stock_instruments
SET price_url = 'https://english.mubasher.info/markets/EGX/stocks/ACTF'
WHERE ticker = 'ACT_FINANCIAL_CONSULTING';

UPDATE personal_stock_instruments
SET price_url = 'https://english.mubasher.info/markets/EGX/stocks/BTFH'
WHERE ticker = 'BELTONE_FINANCIAL_HOLDING';
