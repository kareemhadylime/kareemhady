# __fixtures__

Committed test inputs for `xlsx-import.test.ts`. Do NOT modify these files —
test assertions hard-code the expected partner counts and totals derived from
them.

- `suppliers-2025-12-31.xlsx` — 85 supplier rows, total −8,567,422.64 EGP.
  Copied from `Lime Domains/Beithady/FINANCIALS/BH Accounts Payable Suppliers
  partner_ledger - 2026-05-12T134322.492.xlsx` on 2026-05-12.
- `owners-2025-12-31.xlsx` — 6 owner rows, total −2,518,213.03 EGP. Copied
  from `Lime Domains/Beithady/FINANCIALS/BH Owners Payable partner_ledger -
  2026-05-12T162037.416.xlsx` on 2026-05-12.

If the source xlsx files change, regenerate these fixtures AND update the
test assertions.
