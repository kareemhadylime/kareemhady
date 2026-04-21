import { NextRequest, NextResponse } from 'next/server';
import { listGuestyListings, type GuestyListing } from '@/lib/guesty';
import { supabaseAdmin } from '@/lib/supabase';

// One-shot BH-73 parent/child audit. Compares Guesty's MTL (multi-unit)
// structure against the 14 listings PriceLabs is currently managing for
// BH-73 — so we can see which units are parents, which are children, and
// where the gap between the two PMSes sits.
//
// Protected by CRON_SECRET:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://kareemhady.vercel.app/api/analysis/bh-73-comparison

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const started = Date.now();

  // 1. Fetch ALL Guesty listings (small tenant, ~100), then filter for
  // BH-73 in memory. Beithady's naming convention varies: some listings
  // use 'BH73-*' (no dash after BH) while others use 'BH-73-*'. We accept
  // either. Omit the fields projection entirely so Guesty returns its
  // default field set including listingType + masterListingId.
  // Guesty's default projection omits listingType + masterListingId — must
  // request them explicitly.
  const GUESTY_FIELDS =
    '_id nickname title active listingType masterListingId bedrooms accommodates propertyType accountId address.full tags customFields';

  let offset = 0;
  const all: GuestyListing[] = [];
  while (offset < 500) {
    const res = await listGuestyListings({
      limit: 100,
      skip: offset,
      fields: GUESTY_FIELDS,
    });
    all.push(...(res.results || []));
    if ((res.results || []).length < 100) break;
    offset += 100;
  }

  // Match BH-73 with OR without the dash, but exclude neighbours like BH-73x
  // and make sure BH-734 / BH-735 etc. don't slip through.
  const isBh73 = (s: string | undefined | null): boolean => {
    const up = String(s || '').toUpperCase();
    return /\bBH-?73(?:-|\b)/.test(up);
  };
  const guestyListings = all.filter(
    l => isBh73(l.nickname) || isBh73(l.title)
  );

  // Classify by listing type (Guesty's listingType often absent from list
  // projection on this tenant — fall back to nickname parsing below).
  const byType = new Map<string, number>();
  const parents: GuestyListing[] = [];
  const children: GuestyListing[] = [];
  const singles: GuestyListing[] = [];
  const parentIdSet = new Set<string>();
  for (const l of guestyListings) {
    const t = String(l.listingType || 'UNKNOWN').toUpperCase();
    byType.set(t, (byType.get(t) || 0) + 1);
    if (t === 'MTL') {
      parents.push(l);
      parentIdSet.add(String(l._id));
    } else if (l.masterListingId) {
      children.push(l);
    } else {
      singles.push(l);
    }
  }

  // Virtual parent-group derived from nickname: Beithady's BH-73 naming is
  // `BH73-<bedtype>-<subgroup>-<subnum>-<floorunit>` (e.g. BH73-3BR-SB-1-301
  // = Sub-Building 1, 3-bedroom, floor 3 unit). Group by the first N-1 hyphen
  // segments so all floors of the same physical multi-unit roll up.
  const groupKey = (nick: string | undefined | null): string | null => {
    const n = String(nick || '').trim();
    if (!n) return null;
    const parts = n.split('-');
    if (parts.length <= 2) return null;
    // Drop the last segment (unit/floor id) to get the parent key.
    return parts.slice(0, -1).join('-');
  };
  type NicknameGroup = {
    key: string;
    children: Array<{
      id: string;
      nickname: string;
      bedrooms?: number;
      accommodates?: number;
      in_pl: boolean;
      active?: boolean;
    }>;
  };
  const nicknameGroups = new Map<string, NicknameGroup>();
  for (const l of guestyListings) {
    const key = groupKey(l.nickname);
    if (!key) continue;
    const existing = nicknameGroups.get(key);
    const entry = {
      id: String(l._id),
      nickname: l.nickname || '',
      bedrooms: typeof l.bedrooms === 'number' ? l.bedrooms : undefined,
      accommodates:
        typeof l.accommodates === 'number' ? l.accommodates : undefined,
      in_pl: false, // filled in after we have the PL id set
      active: l.active,
    };
    if (existing) existing.children.push(entry);
    else nicknameGroups.set(key, { key, children: [entry] });
  }

  // 2. PriceLabs BH-73 listings from Supabase
  const sb = supabaseAdmin();
  const { data: plRows } = await sb
    .from('pricelabs_listings')
    .select('id, name, bedrooms, push_enabled')
    .eq('building_code', 'BH-73');
  const plListings = (plRows as Array<{
    id: string;
    name: string;
    bedrooms: number | null;
    push_enabled: boolean | null;
  }>) || [];
  const plIdSet = new Set(plListings.map(p => p.id));
  // Fill PL-match flags on each nickname-grouped child now that plIdSet exists.
  for (const grp of nicknameGroups.values()) {
    for (const c of grp.children) {
      c.in_pl = plIdSet.has(c.id);
    }
  }

  // 3. Match each Guesty listing against PriceLabs.
  const guestyInPL: Array<{ g: GuestyListing; in_pl: boolean; is_parent: boolean; parent_in_pl?: boolean }> = [];
  for (const g of guestyListings) {
    const gid = String(g._id);
    const isParent = (g.listingType || '').toString().toUpperCase() === 'MTL';
    const parentId = g.masterListingId ? String(g.masterListingId) : null;
    guestyInPL.push({
      g,
      in_pl: plIdSet.has(gid),
      is_parent: isParent,
      parent_in_pl: parentId ? plIdSet.has(parentId) : undefined,
    });
  }

  // 4. PriceLabs listings that DON'T appear in Guesty (orphans)
  const guestyIdSet = new Set(guestyListings.map(g => String(g._id)));
  const plOrphans = plListings.filter(p => !guestyIdSet.has(p.id));

  // 5. Parent → children tree
  const tree = parents.map(p => {
    const pid = String(p._id);
    const kids = children.filter(c => String(c.masterListingId) === pid);
    return {
      parent: {
        id: pid,
        nickname: p.nickname,
        title: p.title,
        bedrooms: p.bedrooms,
        active: p.active,
        in_pricelabs: plIdSet.has(pid),
      },
      children: kids.map(c => ({
        id: String(c._id),
        nickname: c.nickname,
        title: c.title,
        bedrooms: c.bedrooms,
        accommodates: c.accommodates,
        active: c.active,
        in_pricelabs: plIdSet.has(String(c._id)),
      })),
    };
  });

  // Orphan children (child with masterListingId but parent isn't in our result set)
  const orphanChildren = children.filter(
    c => !parentIdSet.has(String(c.masterListingId))
  );

  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
    guesty: {
      total_bh_73: guestyListings.length,
      by_listing_type: Object.fromEntries(byType),
      parents: parents.length,
      children: children.length,
      singles: singles.length,
      orphan_children: orphanChildren.length,
    },
    pricelabs: {
      total_bh_73: plListings.length,
      push_enabled: plListings.filter(p => p.push_enabled).length,
    },
    gap: {
      in_guesty_not_in_pl: guestyInPL
        .filter(r => !r.in_pl)
        .map(r => ({
          id: String(r.g._id),
          nickname: r.g.nickname,
          listingType: r.g.listingType,
          is_parent: r.is_parent,
          masterListingId: r.g.masterListingId || null,
          parent_also_missing_from_pl: r.parent_in_pl === false,
          active: r.g.active,
        })),
      in_pl_not_in_guesty: plOrphans.map(p => ({
        id: p.id,
        name: p.name,
      })),
    },
    tree,
    nickname_groups: Array.from(nicknameGroups.values())
      .map(g => ({
        parent_key: g.key,
        children_count: g.children.length,
        in_pl_count: g.children.filter(c => c.in_pl).length,
        bedrooms: g.children[0]?.bedrooms ?? null,
        children: g.children
          .slice()
          .sort((a, b) => a.nickname.localeCompare(b.nickname))
          .map(c => ({
            nickname: c.nickname,
            in_pl: c.in_pl,
            bedrooms: c.bedrooms ?? null,
            accommodates: c.accommodates ?? null,
            active: c.active ?? null,
          })),
      }))
      .sort((a, b) => a.parent_key.localeCompare(b.parent_key)),
    note:
      "Guesty's API projection omits listingType/masterListingId on this tenant, so we also derive parent groups from the nickname convention BH73-<bedtype>-<subgroup>-<subnum>-<floor> (parent = first N-1 segments). This shows the Multi-Unit structure even when MTL metadata isn't surfaced.",
  });
}
