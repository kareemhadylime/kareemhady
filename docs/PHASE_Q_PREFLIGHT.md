# Phase Q — Pre-flight findings (Q.0, doc-only)

Date: 2026-04-29
Sub-phase: Q.0 (locks before any code-touching commit lands)
Standing process gate: Plan → Workflow → **Q.0 pre-flight (this doc)** → Q.1 first real code

## 1. `beithady_conversations.reservation_id` coverage

| Slice | Count |
|---|---|
| Open conversations total | 6,741 |
| Open with `reservation_id` set | 6,720 |
| **Coverage %** | **99.7%** |
| Open without `reservation_id` | 21 |
| Orphans (`reservation_id` set but row missing in `guesty_reservations`) | **0** |

**Implication for Q.1**
- Reservation chip surfaces on virtually every conversation. The "❓ No reservation linked" fallback path is real but rare — affects 21 conversations at the moment of writing, mostly stray inbound WhatsApp Casual messages from people who never booked.
- Zero orphan rate means we don't need a defensive "Reservation pending sync" gray-chip variant. If the join misses, treat as data anomaly (log + show fallback).

## 2. Reservation status distribution on linked conversations

| status | count | "in-house today" by date span |
|---|---|---|
| confirmed | 3,160 | 49 |
| inquiry | 2,929 | 34 |
| canceled | 594 | 7 |
| closed | 32 | 0 |
| declined | 4 | 0 |
| reserved | 1 | 0 |

**Status → chip mapping (locks Q.1 logic):**

| Guesty status | Chip variant |
|---|---|
| `confirmed`, `reserved`, `checked_in`, `checked_out` | Date-bucketed: **🟢 In-house** if today ∈ [check_in, check_out], **🔵 Future** if check_in > today, **⚪ Past** if check_out < today |
| `inquiry` | **🟡 Inquiry · requested Jun 12 → 16** (date span shown but never "in-house") |
| `canceled`, `cancelled`, `declined`, `closed` | **❌ Cancelled** (with cancellation date if available) |

**Important nuance** — 34 inquiry conversations have date spans that include today. Those are NOT in-house guests; they're prospective guests who asked about today's dates without booking. The chip must use **status first, dates second** to compute the bucket, otherwise we'd incorrectly mark inquiry guests as "in-house".

## 3. Source / messaging-platform distribution (last 30 days, active reservations)

| source | count | in-house |
|---|---|---|
| airbnb2 | 167 | 36 |
| manual | 78 | 11 |
| Booking.com | 22 | 2 |
| website | 5 | 0 |
| Capital One | 1 | 0 |
| Hotels.com | 1 | 0 |

**Implication** — Existing source pill on the right panel (`AIRBNB`, etc.) already covers messaging platform per Q.1's "Messaging Platform" requirement. No new code needed for that surface — existing `<ThreadHeader>` line 104-108 in `src/app/beithady/communication/_components/thread-pane.tsx` already strips the trailing `2` and renders an uppercased pill.

## 4. Guesty Open API media-URL probe (Q.3.1 risk reducer)

**Key file:** `src/lib/guesty.ts:516-560` — `sendGuestyConversationPost`

```ts
type GuestySendPostInput = {
  conversationId: string;
  body: string;
  type?: 'message' | 'note';
  subject?: string;
  module?: 'email' | 'sms' | 'whatsapp' | 'log';
  attachments?: Array<{ url: string; name?: string; mime?: string }>;  // ← already wired
};
```

The `attachments` array is **already plumbed through to the Guesty Open API** at `/communication/conversations/{id}/posts`. The composer just doesn't expose it yet.

**Decision** — collapse Q.3.1 into Q.3. Both `wa_casual` and `guesty` composers ship multi-attach in a single commit. Risk is now: we send attachments and Guesty's Airbnb/Booking sub-channels may silently drop them. Mitigation: probe by sending one test attachment to a low-stakes Airbnb thread before declaring Q.3 done, document the channel matrix in the channel-cap hint.

## 5. `guesty_listings.raw` payload — pictures NOT stored locally

**Available top-level keys in `raw`:** `_id, accommodates, accountId, active, address, bedrooms, customFields, nickname, propertyType, tags, title`.

**No `pictures` field.** The Guesty sync (`src/lib/run-guesty-sync.ts`) intentionally slims down the listing payload to keep storage costs down.

**Decision overrides Q7 default:**
- **Originally locked:** library = guesty.raw.pictures (primary) + beithady_listing_assets (extras)
- **Revised:** library = `beithady_listing_assets` **only** in V1. Guesty pictures sync extension deferred to V2.

**Path forward for Q.3:**
- New table `beithady_listing_assets` (already in workflow doc) becomes the sole source.
- Admin upload UI required up front (was going to be optional). One-time effort: staff upload 5-10 photos per listing. ~80 active listings × 7 photos avg = ~560 uploads.
- For initial seed, recommend a separate Q.3.5 ad-hoc bulk upload tool: drag a folder of photos named like `BH-435-001_kitchen.jpg` and the tool auto-routes to the right listing. **Out of Phase Q scope** — flag for follow-on work.

**Estimated impact** — listing library will be empty on day 1. Composer should show "No photos in library for {listing} · Upload some" with an inline upload CTA. Staff populates on demand.

## 6. `beithady_guests` columns — guest-history badge dependencies

Already present on the table:
- `lifetime_stays integer`
- `lifetime_nights integer`
- `lifetime_spend_usd numeric`
- `vip boolean`
- `loyalty_tier text`
- `last_seen timestamptz`
- `next_arrival_at timestamptz`
- `language text`

**Implication for Q.1 #2** — Guest history badge can read these directly via the existing `header.guest_id` join. No derivation queries needed, no new columns required.

## 7. Storage bucket inventory

| Bucket | Public | Size limit | Use |
|---|---|---|---|
| `beithady-wa-media` | yes | 20 MB | **Q.3 outbound chat attachments** (existing) |
| `beithady-gallery-public` | yes | 50 MB | **Q.3 listing library photos** (50 MB > 20 MB enables full-res marketing photos) |
| `beithady-gallery` | no | 50 MB | curated, untouched |
| `beithady-documents` | no | 100 MB | untouched |
| `beithady-inventory` | no | 10 MB | untouched |

**Q.3 storage strategy:**
- Outbound user-uploaded media → `beithady-wa-media/wa-casual/{ts}-{id}.{ext}` (existing path) and `beithady-wa-media/guesty/{ts}-{id}.{ext}` (new)
- Listing library photos → `beithady-gallery-public/listing/{listing_id}/{ts}-{id}.{ext}`

## 8. Vercel cron count

| Slice | Count |
|---|---|
| Current `vercel.json` paths | 33 |
| Crons added by Phase Q | 0 |
| Pro plan limit | 40 |
| Headroom | 7 |

No cron changes in Phase Q. ✓

## 9. Final 8 template bodies — locked seeds

Stored as `body` text with `{var}` placeholders. Resolver runs client-side at template-pick time. Block-send if any `{var}` remains unresolved.

| # | name | language | category | source filter | body sketch |
|---|---|---|---|---|---|
| 1 | Welcome / pre-arrival WhatsApp · EN | en | greeting | any | "Hi {guest_first_name}, this is Kareem from Beit Hady. We're delighted to host you at {listing_nickname} from {check_in_date} to {check_out_date} ({nights} nights). Could you share your estimated arrival time so we can prepare your unit?" |
| 2 | Welcome / pre-arrival WhatsApp · AR | ar | greeting | any | "أهلاً {guest_first_name}، أنا كريم من بيت هادي. سنستضيفكم في {listing_nickname} من {check_in_date} إلى {check_out_date} ({nights} ليالٍ). متى تتوقعون الوصول لنجهز لكم الوحدة؟" |
| 3 | Wifi + check-in instructions | en | checkin | any | "Welcome to {listing_nickname}!\n\nWifi: {wifi_ssid} / {wifi_password}\nCheck-in time: {checkin_time}\nAddress: {address}\n\nMessage me on WhatsApp anytime if you need anything — Kareem" |
| 4 | Checkout instructions | en | checkout | any | "Hi {guest_first_name}, your checkout from {listing_nickname} is on {check_out_date} by 11:00 AM. Please leave the keys on the kitchen counter and lock the door behind you. Thanks for staying with us!" |
| 5 | No availability for those dates | en | inquiry | any | "Thanks for reaching out, {guest_first_name}. Unfortunately {listing_nickname} is fully booked for the dates you requested. We have other units available — would you like me to send options for the same dates in the same building?" |
| 6 | Inquiry follow-up — quote sent · 24h | en | inquiry | any | "Hi {guest_first_name}, just checking in on the quote we sent yesterday for {listing_nickname}. Happy to answer any questions or hold the dates if you're ready to confirm." |
| 7 | Late checkout granted (loyalty perk) | en | upsell | any | "{guest_first_name}, as a Beit Hady returning guest we're happy to grant you complimentary late checkout — feel free to leave by 1:00 PM on {check_out_date}. Enjoy the rest of your stay!" |
| 8 | Negative-review pre-empt apology | en | escalation | any | "{guest_first_name}, I'm sorry your stay at {listing_nickname} didn't meet expectations. I'd really value the chance to make this right — could we hop on a quick call so I can hear what happened and arrange compensation?" |

(9th candidate "Quiet hours reminder · bilingual" dropped per workflow Q4 trim — defer to admin CRUD.)

## 10. Schema changes locked for Q.2 / Q.3 / Q.4

```sql
-- Q.2 (migration 0053a)
create table beithady_message_templates (...);
-- 8 seed inserts

-- Q.2 (migration 0053b)
create table beithady_listing_secrets (
  listing_id text primary key references guesty_listings(id) on delete cascade,
  wifi_ssid text, wifi_password text,
  gate_code text, parking_notes text,
  checkin_time text default '15:00',
  custom_kv jsonb default '{}'::jsonb,
  updated_by_user_id uuid references app_users(id),
  updated_at timestamptz not null default now()
);

-- Q.3 (migration 0053c)
create table beithady_listing_assets (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references guesty_listings(id) on delete cascade,
  category text not null check (category in ('photo','wifi_card','gate_diagram','parking_diagram','checklist')),
  storage_path text not null,           -- beithady-gallery-public/listing/{listing_id}/{file}
  public_url text not null,
  caption text,
  sort_order int default 0,
  uploaded_by_user_id uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_bh_listing_assets_listing on beithady_listing_assets(listing_id, category, sort_order);

-- Q.4 (migration 0053d)
create table beithady_conversation_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references beithady_conversations(id) on delete cascade,
  author_user_id uuid not null references app_users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index idx_bh_conv_notes_conv on beithady_conversation_notes(conversation_id, created_at desc);

alter table beithady_conversations
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_reason text check (resolved_reason in ('resolved','spam','no_response','booked','duplicate')),
  add column if not exists resolved_by_user_id uuid references app_users(id);
```

## 11. Risk register — final

| # | Risk | Mitigation |
|---|---|---|
| 1 | Inquiry rezzies with current dates show "in-house" | Status-first compute (P1 above) |
| 2 | Guesty `attachments[]` rejected by Airbnb sub-channel | Send one probe, document, hide chip if it fails |
| 3 | Listing library empty day 1 | Inline upload CTA; bulk-upload tool flagged for follow-on |
| 4 | WABA template picker out of scope | Q.2 ships free-text only; WABA = Q.2b after WABA provisioning |
| 5 | Multi-image Green-API rate limit | 1.5s sleep between sends; max 5 per send |
| 6 | Calendar drawer `?reservation=<id>` doesn't exist for inquiry-only resids | Verified: drawer exists for all guesty_reservations rows; orphan rate is 0 |
| 7 | `closed` status in Q.0.2 — never seen in code | Map to `cancelled` bucket — same UX |
| 8 | Translate API costs at scale | One translation per click, no auto; cache in client state |

## 12. Sub-phase commit sequence — confirmed

| # | Commit | Status |
|---|---|---|
| Q.0 | doc-only pre-flight (this file) | shipping next |
| Q.1 | reservation chip + popout + mini-timeline + guest history | next-after |
| Q.2 | templates V1 + 0053a/b + variable resolver | |
| Q.2.5 | admin templates CRUD page | |
| Q.3 | wa_casual + guesty multi-attach + library + 0053c (Q.3.1 collapsed in) | |
| Q.4 | polish bundle + 0053d | |

## 13. Confidence

**95%** post-pre-flight. Down from the workflow doc's 80% by:
- Reservation coverage 99.7% (better than feared)
- Zero orphans
- Guesty `attachments[]` already wired (Q.3.1 collapses)
- Storage buckets already provisioned
- Guest history columns already exist

Up by:
- Listing library = staff-managed only (Guesty pictures not in mirror) — needs admin upload UI sooner

Net: ready to ship Q.1 next turn.
