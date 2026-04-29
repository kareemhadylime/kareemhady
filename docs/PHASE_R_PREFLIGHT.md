# Phase R — Pre-flight findings (R.0, doc-only)

Date: 2026-04-29
Sub-phase: R.0 (locks before R.1 schema lands)

## 1. Conversation universe at start of Phase R

| Slice | Count |
|---|---|
| Total conversations | 6,744 |
| state = `open` | **6,744** |
| state = `closed` | **0** |
| Oldest row at | 2024-02-28 |

**Critical insight** — `closed` state is **never used** today. Every conversation in the Beithady comm store is `open`. The auto-cron predicate `(state='closed' and modified_at_external < cutoff)` matches **0 rows**. All auto-archival flows through the second branch: `state='open' and (last_inbound_at is null or last_inbound_at < cutoff)`.

This doesn't break the design but does mean the "closed" auto-archive bucket is purely future-proofing. No need to backfill state values.

## 2. Day-1 archive impact (90-day cutoff)

| | Value |
|---|---|
| Cutoff (now − 90 days) | 2026-01-29 |
| Conversations meeting predicate | **5,496** |
| Active conversations remaining post-archive | **1,248** |
| % archived day 1 | **81.5%** |

**Implication**: First cron run is enormous. The workflow's `LIMIT 5000 per run` predicate spreads it across **2 nights** (5000 first, 496 second). `?dry_run=1` mandatory before first real run. Audit row size = 1 per night, not 5000 per night.

## 3. Month-bucket distribution (drives year/month grid)

```
2026: 1,788  (Apr 498 · Mar 368 · Feb 426 · Jan 496)
2025: 4,167  (Dec 493 · Nov 467 · Oct 508 · Sep 441 · Aug 481 · Jul 492 · Jun 513 · May 197 · Apr 213 · Mar 87 · Feb 78 · Jan 97)
2024: 789    (Dec 152 · Nov 122 · Oct 114 · Sep 130 · Aug 116 · Jul 112 · Jun 138 · May 4 · Feb 1)
```

**Year-grid landing renders 3 cards**: 2026 / 2025 / 2024. April 2024 + March 2024 buckets are skipped (0 rows).

**Month-grid for each year skips empty months** — May 2024 (4 conversations) is borderline; per workflow §11 we still show it because we filter `count > 0`.

## 4. Active conversations remaining after auto-cron

After first auto-cron archives 5,496 conversations, the live inbox of 1,248 conversations breaks down:
- Apr 2026: 474 (498 - 24 archive)
- Mar 2026: 366 (368 - 2 archive)
- Feb 2026: 384 (426 - 42 archive)
- Jan 2026: 24 (496 - 472 archive)
- ≤ Dec 2025 + earlier: 0 (all archive — last_inbound_at is universally < cutoff)

This is the practical day-2 inbox. **5.4× lighter, dramatic SLA-bucket density improvement** because old stale "open" conversations stop diluting the breach metric.

## 5. `beithady_settings` schema verified

```
key         text PK
value       jsonb       — NOT text; settings reads must JSONB-cast
description text
updated_at  timestamptz
updated_by  uuid
```

**Workflow doc adjustment**: original seed example had `label` column — removed. The setting is stored as `'90'::jsonb` (a JSONB number).

## 6. `app_users.id` is uuid ✓

`archived_by_user_id uuid references public.app_users(id)` — type-clean.

## 7. Vercel cron count

| Slice | Count |
|---|---|
| Current | 33 |
| Phase R adds | +1 |
| New total | **34** |
| Pro plan limit | 40 |
| Headroom | 6 |

## 8. Risk register — final

| # | Risk | Mitigation |
|---|---|---|
| 1 | First-run archives 81.5% of inbox in one shot | `?dry_run=1` first; LIMIT 5000/run spreads to 2 nights; settings `comm_auto_archive_pause = true` flag for emergency stop |
| 2 | Webhook ingest auto-restores when guest replies — could ping-pong | One-way: `archived_at = null` only on inbound. No re-archive via webhook. Cron is the only path back to archived state |
| 3 | Restored conversation's reservation_id stale | Reservation chip is read-only data; no risk |
| 4 | Mobile fullscreen on iOS — Safari address bar collapse | `100dvh` not `100vh` |
| 5 | Stop hook stale on long deploys | Already handled; SESSION_HANDOFF stays fresh per turn |
| 6 | Closed state never used — design over-engineered? | Keep — future Phase E AI auto-close needs it, future bulk-mark-resolved (Q.4 #5) needs it. No-op cost |
| 7 | "Search archive" V1 across one month — what about cross-month? | Documented as V2 |
| 8 | RLS policy on archive routes | Reuse `requireBeithadyPermission('communication', 'read')` for archive read; `'full'` for restore |

## 9. Locked configuration

| Knob | Value |
|---|---|
| `comm_auto_archive_days` | `90` |
| `comm_auto_archive_pause` | `false` |
| `comm_auto_archive_max_per_run` | `5000` |
| Cron schedule | `0 1 * * *` UTC (4 AM Cairo winter / 3 AM summer) |
| Mobile breakpoint | `lg` (1024px) — sidebar hidden when `?c=` set on `< lg` |

## 10. Confidence

**95%** post-pre-flight. Down by:
- First-run impact 5,496 (worse than initial estimate of ~5,000)

Up by:
- Confirmed schema of `beithady_settings`
- Confirmed `app_users.id` uuid
- Closed state never used — simplifies test surface

Ready to ship R.1 schema migration next.
