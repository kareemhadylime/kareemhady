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

  // 1. Fetch Guesty listings. Use a broad filter on nickname starting with
  // "BH-73" — Beithady's naming convention. Guesty's filters accept Mongo-
  // style `$regex` under the hood. Fall back to a larger pull + client-side
  // filter if regex isn't accepted on this tenant.
  let guestyListings: GuestyListing[] = [];
  try {
    const res = await listGuestyListings({
      limit: 100,
      filters: { nickname: { $regex: '^BH-73', $options: 'i' } },
      fields: '_id nickname title active listingType masterListingId bedrooms accommodates propertyType tags customFields',
    });
    guestyListings = res.results || [];
  } catch (e) {
    // Fallback: fetch wider + filter in JS
    const res = await listGuestyListings({
      limit: 100,
      fields: '_id nickname title active listingType masterListingId bedrooms accommodates propertyType tags customFields',
    });
    guestyListings = (res.results || []).filter(l =>
      String(l.nickname || '').toUpperCase().startsWith('BH-73') ||
      String(l.title || '').toUpperCase().includes('BH-73')
    );
  }

  // If still empty, try a paged broad pull for BH-73 substring match.
  if (guestyListings.length === 0) {
    let offset = 0;
    const all: GuestyListing[] = [];
    while (offset < 500) {
      const res = await listGuestyListings({
        limit: 100,
        skip: offset,
        fields: '_id nickname title active listingType masterListingId bedrooms accommodates propertyType tags',
      });
      all.push(...(res.results || []));
      if ((res.results || []).length < 100) break;
      offset += 100;
    }
    guestyListings = all.filter(l =>
      String(l.nickname || '').toUpperCase().includes('BH-73') ||
      String(l.title || '').toUpperCase().includes('BH-73')
    );
  }

  // Classify by listing type.
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
    note:
      'Multi-Unit Strategy: Guesty assigns a parent MTL record per physical unit + child SINGLE records for each sub-listing. PriceLabs typically manages pricing at the parent/master level.',
  });
}
