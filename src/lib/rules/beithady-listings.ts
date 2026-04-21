// Authoritative Beithady property catalog.
// Source: /C:\kareemhady\.claude\Documents\Beithady Listings.csv (imported 2026-04-21).
// Columns: NICKNAME, TITLE, TYPE OF UNIT, TAGS (CSV), LISTING ID (Guesty internal).
// When updating: paste the CSV rows below. Keep the header comment date fresh.

export type BeithadyUnitType = 'SINGLE-UNIT' | 'MULTI-UNIT' | 'SUB-UNIT';

export type BeithadyListing = {
  nickname: string;
  title: string;
  unit_type: BeithadyUnitType;
  tags: string[];
  building_tag: string; // primary (first) tag — treated as the building group
  guesty_listing_id: string;
};

// Raw rows: [nickname, title, unit_type, tags_joined, guesty_id].
const RAW: ReadonlyArray<
  readonly [string, string, BeithadyUnitType, string, string]
> = [
  ['BH-101-55', 'Luxurious 3 Bedroom in Katameya BH-101-55', 'SINGLE-UNIT', 'BH-ONEKAT', '68dd74cb1988ea0014f2117f'],
  ['BH-107-46', 'Luxurious 3 Bedroom in Katameya 107', 'SINGLE-UNIT', 'BH-ONEKAT', '683c11f34d2a6400130375a1'],
  ['BH-109-23', 'Stylish 2BR - Gated Compound', 'SINGLE-UNIT', 'BH-ONEKAT', '68836b431ceaef0019c095ef'],
  ['BH-109-43', 'Stylish 2BR - Gated Compound - By Beithady', 'SINGLE-UNIT', 'BH-ONEKAT', '68836b3d78154e00125ea3d4'],
  ['BH-114-73', 'Luxurious 3 Bedroom in Katameya', 'SINGLE-UNIT', 'BH-ONEKAT', '683c124b6caa4b0014b0125d'],
  ['BH-115-75', 'Gorgeous 3 Bed in Prime Location BH-115-75', 'SINGLE-UNIT', 'BH-ONEKAT', '693d4e50937d490014bd2789'],
  ['BH-116-36', 'Luxurious 3 Bedroom in Katameya', 'SINGLE-UNIT', 'BH-ONEKAT', '683c12652da41e0012471674'],
  ['BH-202-61', 'Gorgeous 3 Bed in Prime Location', 'SINGLE-UNIT', 'BH-ONEKAT', '683c126e24fa7d00130403a2'],
  ['BH-203-86', 'Luxurious 3 Bedroom in Katameya - BH-203-86', 'SINGLE-UNIT', 'BH-ONEKAT', '68dd74bca2a5190013fb7934'],
  ['BH-213-82', 'Luxurious 2 Bedroom in Katameya', 'SINGLE-UNIT', 'BH-ONEKAT', '683c1180d12c0d0011695b56'],
  ['BH-26-001', 'Luxury 2BR - 2 Ensuites - By Beit Hady - BH-26-001', 'SINGLE-UNIT', 'BH-26', '683c126126abd20013ca7ffb'],
  ['BH-26-002', 'Cozy 1BR Apt - Ensuite - By BeitHady - BH-26-002', 'SINGLE-UNIT', 'BH-26', '683c1273f69e2f00120dbe43'],
  ['BH-26-003', 'Stylish 2BR - Ensuite - Smart Home - By BeitHady - BH-26-003', 'SINGLE-UNIT', 'BH-26', '683c12233f54570013b3bdef'],
  ['BH-26-004', 'Luxury Modern Studio - Ensuite - By Beithady - BH-26-004', 'SINGLE-UNIT', 'BH-26', '683c12772da41e001247180e'],
  ['BH-26-005', 'Luxury 1BR - 2 Twins - Pool - By Beithady - BH-26-005', 'SINGLE-UNIT', 'BH-26', '683c125726abd20013ca7e90'],
  ['BH-26-101', 'Luxury 3BR - 3 Ensuites - Pool - By Beithady - BH-26-101', 'SINGLE-UNIT', 'BH-26', '683c12a7f69e2f00120dc247'],
  ['BH-26-102', 'Luxury 2 BR - Ensuite - POOL - By Beithady - BH-26-102', 'SINGLE-UNIT', 'BH-26', '683c12abac9d7200139ff7ef'],
  ['BH-26-103', 'Luxury Smart Studio - King Bed - By Beithady - BH-26-103', 'SINGLE-UNIT', 'BH-26', '683c127ef69e2f00120dbfb1'],
  ['BH-26-104', 'Elegant 3BR Apt -3 Ensuites - Pool - By Beithady - BH-26-104', 'SINGLE-UNIT', 'BH-26', '683c127a6caa4b0014b015cf'],
  ['BH-26-201', 'Luxury 3BR - 3 Ensuites - Pool - By Beithady - BH-26-201', 'SINGLE-UNIT', 'BH-26', '6840abba33647e0012819334'],
  ['BH-26-202', 'Luxury 2 BR - 1 Ensuite POOL - By Beithady - BH-26-202', 'SINGLE-UNIT', 'BH-26', '6840abc06c68ed0012c5bf05'],
  ['BH-26-203', 'Luxury Smart Studio - King Bed - By Beithady - BH-26-203', 'SINGLE-UNIT', 'BH-26', '6840abc102465e000f9bf395'],
  ['BH-26-204', 'Elegant 3BR Apt - 3 Ensuites - Pool - By Beithady - BH-26-204', 'SINGLE-UNIT', 'BH-26', '6840abc29a8f0b001ad9a374'],
  ['BH-26-301', 'Luxury 3BR - 3 Ensuites - Pool - By Beithady - BH-26-301', 'SINGLE-UNIT', 'BH-26', '6840abc674ad770010661896'],
  ['BH-26-302', 'Luxury 2 BR - 1 Ensuite - POOL - By Beithady - BH-26-302', 'SINGLE-UNIT', 'BH-26', '6840abc7d6ec000013a66503'],
  ['BH-26-303', 'Luxury Smart Studio - King Bed - By Beithady - BH-26-303', 'SINGLE-UNIT', 'BH-26', '6840abc79a8f0b001ad9a467'],
  ['BH-26-304', 'Elegant 3BR Apt - 3 Ensuites - Pool - By Beithady - BH-26-304', 'SINGLE-UNIT', 'BH-26', '6840abcba5a923001aeab1e4'],
  ['BH-26-401', 'Luxury 3BR - 3 Ensuites - Pool - By Beithady - BH-26-401', 'SINGLE-UNIT', 'BH-26', '684f1741022471001a1e911f'],
  ['BH-26-402', 'Luxury 2 BR - 1 Ensuite - POOL - By Beithady - BH-26-402', 'SINGLE-UNIT', 'BH-26', '684f20f517cd8c00295fdb2f'],
  ['BH-26-403', 'Luxury Smart Studio - King Bed - POOL - By Beithady - BH-26-403', 'SINGLE-UNIT', 'BH-26', '684f25cb354ac70012fe5ad6'],
  ['BH-26-404', 'Elegant 3BR Apt - 3 Ensuites - POOL - By Beithady - BH-26-404', 'SINGLE-UNIT', 'BH-26', '684f2b112c6ef60010bcb586'],
  ['BH-26-501', 'Penthouse w/ Private Terrace • 2 Ensuite BRs', 'SINGLE-UNIT', 'BH-26', '687a090e91ee1d001249f493'],
  ['BH-435-001', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c11642da41e00124708ab'],
  ['BH-435-002', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c117ad73a620012342d9f'],
  ['BH-435-003', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c1169d73a620012342bce'],
  ['BH-435-101', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c11284d2a640013036ea6'],
  ['BH-435-102', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c12986b645700128b4ae4'],
  ['BH-435-103', 'Luxury 3 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c1144ac9d7200139fe993'],
  ['BH-435-201', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c111734d8de000ec5f5f7'],
  ['BH-435-202', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c115fd73a6200123429f2'],
  ['BH-435-203', 'Luxury 3 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c1111b0be320013165797'],
  ['BH-435-301', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c11595302020010cd2dfd'],
  ['BH-435-302', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c10f17fe8b50011824aea'],
  ['BH-435-303', 'Luxury 3 Bedroom Residence By Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c10ecac9d7200139fe586'],
  ['BH-435-401', 'Luxury 2 Bedroom Residence by Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c110c6127110010971fd7'],
  ['BH-435-402', 'Luxurious 4BR in NewCairo By Beit Hady', 'SINGLE-UNIT', 'BH-435', '683c121626abd20013ca7bc5'],
  ['BH-MANG-M15B13', 'Stunning 2BD - Mangroovy - Gouna', 'SINGLE-UNIT', 'BH-GOUNA', '683c121d6b645700128b4420'],
  ['BH-MB34-105', 'Elegant 2BR AbuTig Marina Direct Marina View By BH', 'SINGLE-UNIT', 'BH-GOUNA', '694a6bf44449ce002bb70d06'],
  ['BH-MG-20-1', 'Contemporary 3BR in Almaza,Heliopolis -By Beithady', 'SINGLE-UNIT', 'BH-MG,BH-3BR', '69bd01ba433137001515bee2'],
  ['BH-NEWCAI-4021', 'Stunning Gated 2 BR-Mins To AUC', 'SINGLE-UNIT', 'BH-NEWCAI', '683c11af26abd20013ca7785'],
  ['BH-WS-E245', 'Stunning 4BD-WaterSide-Gouna', 'SINGLE-UNIT', 'BH-GOUNA', '683c120f2da41e00124710c9'],
  ['BH73-1BR-C-8', '1BR King Suite - Near EDNC & AUC - 247 Desk & Security', 'MULTI-UNIT', 'BH-73', '6988ea580da83a002b755795'],
  ['BH73-1BR-C-8-106', '1BR King Suite | 24/7 Desk & Security', 'SUB-UNIT', 'BH-73', '6988ea590da83a002b7558d1'],
  ['BH73-1BR-C-8-306', '1BR King Suite | 24/7 Desk & Security', 'SUB-UNIT', 'BH-73', '6988ea590da83a002b7558e0'],
  ['BH73-2BR-SB-404', 'Luxury 2BR - Primary Suite with Living - 247 FrontDesk & Security', 'SINGLE-UNIT', 'BH-73,BH-2BR', '6988e6ec83c81e00140a2139'],
  ['BH73-2BR-SB-5', 'Premium 2BR - Sofa Bed - Front Desk & Security 247', 'MULTI-UNIT', 'BH-73,BH-2BR', '6988ecd20da83a002b75694a'],
  ['BH73-2BR-SB-5-107', 'Premium 2BR|Sofa Bed|Front Desk & Security 24/7', 'SUB-UNIT', 'BH-73,BH-2BR', '6988ecd20da83a002b756a7c'],
  ['BH73-2BR-SB-5-307', 'Premium 2BR|Sofa Bed|Front Desk & Security 24/7', 'SUB-UNIT', 'BH-73,BH-2BR', '6988ecd20da83a002b756a8b'],
  ['BH73-2BR-SB-6', 'Premium 2BR - Sofa Bed - Near EDNC & AUC - Front Desk & Security 247', 'MULTI-UNIT', 'BH-73,BH-2BR', '6988f6045dbb140015aa84c8'],
  ['BH73-2BR-SB-6-103', 'Premium 2BR|Sofa Bed |Front Desk & Security 24/7', 'SUB-UNIT', 'BH-73,BH-2BR', '6988f0d4966891001530fc10'],
  ['BH73-2BR-SB-6-303', 'Premium 2BR|Sofa Bed |Front Desk & Security 24/7', 'SUB-UNIT', 'BH-73,BH-2BR', '6988f63c220dce0015a610bf'],
  ['BH73-3BR-C-003', 'Outstanding Luxury 3BR Apt | 1 Ensuite | Beithady', 'SINGLE-UNIT', 'BH-73,BH-3BR', '6988ee90bb95130013564fdc'],
  ['BH73-3BR-C-005', 'Outstanding Luxury 3BR Apt - 1 Ensuite - Beithady', 'SINGLE-UNIT', 'BH-73,BH-3BR', '6988efa00bc0a5001c2ab6f7'],
  ['BH73-3BR-C-4', 'Luxury 3BR near AUC & EDNC 5 Beds Reception 247', 'MULTI-UNIT', 'BH-73,BH-3BR', '6988e88ad8f740001465e728'],
  ['BH73-3BR-C-4-203', 'Luxury 3BR near AUC + EDNC |5 Beds |Reception 24/7', 'SUB-UNIT', 'BH-73,BH-3BR', '6989ae710053f400148bf59c'],
  ['BH73-3BR-C-4-403', 'Luxury 3BR near AUC + EDNC |5 Beds |Reception 24/7', 'SUB-UNIT', 'BH-73,BH-3BR', '6988e88ad8f740001465e85c'],
  ['BH73-3BR-SB-1', 'Luxury 3BR  247 Front Desk & Security', 'MULTI-UNIT', 'BH-73,BH-3BR', '698873621ca0b3002b205ac4'],
  ['BH73-3BR-SB-1-001', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205cf5'],
  ['BH73-3BR-SB-1-101', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d29'],
  ['BH73-3BR-SB-1-201', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d5d'],
  ['BH73-3BR-SB-1-301', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d43'],
  ['BH73-3BR-SB-1-401', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205df9'],
  ['BH73-3BR-SB-2', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'MULTI-UNIT', 'BH-73,BH-3BR', '69888ad09c55a60014f3c337'],
  ['BH73-3BR-SB-2-002', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205dc5'],
  ['BH73-3BR-SB-2-102', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d0f'],
  ['BH73-3BR-SB-2-202', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205dab'],
  ['BH73-3BR-SB-2-302', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d91'],
  ['BH73-3BR-SB-2-402', 'Luxury 3BR - Near EDNC - 247 Front Desk & Security BH-73-SB2', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205ddf'],
  ['BH73-3BR-SB-3', 'Luxury 3BR 247 Front Desk & Security', 'MULTI-UNIT', 'BH-73,BH-3BR', '69888ddc9c55a60014f41529'],
  ['BH73-3BR-SB-3-105', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205d77'],
  ['BH73-3BR-SB-3-204', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '698873631ca0b3002b205e13'],
  ['BH73-3BR-SB-3-305', 'Luxury 3BR | 24/7 Front Desk & Security', 'SUB-UNIT', 'BH-73,BH-3BR', '6988e210150ac2003486c599'],
  ['BH73-4BR-C-405', '4BR 3BA - 2 Ensuites - 247 Desk & Security Professionally Managed by Beithady', 'SINGLE-UNIT', 'BH-73,BH-4BR', '6988e56e9c55a60014f81cf1'],
  ['BH73-ST-C-004', 'Modern Studio with 24/7 Service | Beit Hady', 'SINGLE-UNIT', 'BH-73,BH-ST', '6988f8e3d8f7400014661f3d'],
  ['BH73-ST-C-7', 'Studio - King Bed - Near AUC - All-Day Security & Reception', 'MULTI-UNIT', 'BH-73,BH-ST', '6988f7d3fcf62d00159785f7'],
  ['BH73-ST-C-7-104', 'Studio | King Bed | AUC | 24/7 Security', 'SUB-UNIT', 'BH-73,BH-ST', '6988f242acb0080015a70faa'],
  ['BH73-ST-C-7-304', 'Studio | King Bed | AUC | 24/7 Security', 'SUB-UNIT', 'BH-73,BH-ST', '6988f80afcf62d0015978771'],
  ['LIME-MA-1402', 'Mind Blowing Marina View 3BD Apt', 'SINGLE-UNIT', 'DXB', '683edd460d8f3c0021fedfc7'],
  ['REEHAN-204', 'Luxury 2BD @ Burj Dubai & Dubai Mall', 'SINGLE-UNIT', 'DXB', '683edd79c4730f0011ad7b09'],
  ['YANSOON-105', 'Luxury 3BD - @ Burj Dubai & Dubai Mall', 'SINGLE-UNIT', 'DXB', '683edd80b8b96f001c7b6d20'],
];

export const BEITHADY_LISTINGS: readonly BeithadyListing[] = RAW.map(
  ([nickname, title, unit_type, tagsJoined, guesty_listing_id]) => {
    const tags = tagsJoined.split(',').map(t => t.trim()).filter(Boolean);
    return {
      nickname,
      title,
      unit_type,
      tags,
      building_tag: tags[0] || 'UNKNOWN',
      guesty_listing_id,
    };
  }
);

const byNickname = new Map<string, BeithadyListing>();
const byGuestyId = new Map<string, BeithadyListing>();
const byTitle = new Map<string, BeithadyListing>();
for (const l of BEITHADY_LISTINGS) {
  byNickname.set(l.nickname.toUpperCase(), l);
  byGuestyId.set(l.guesty_listing_id, l);
  const key = l.title.toLowerCase().trim();
  // Title collisions are common (e.g. "Luxury 2 Bedroom Residence by Beit Hady"
  // is shared across 10+ BH-435 units). First-write-wins is OK — the exact-
  // title lookup is only a fallback; the primary match is via nickname.
  if (!byTitle.has(key)) byTitle.set(key, l);
}

/** CSV tag names → UI canonical building code. */
export function canonicalBuildingFromTag(tag: string): string {
  if (!tag) return 'UNKNOWN';
  const t = tag.toUpperCase().trim();
  if (t === 'BH-ONEKAT') return 'BH-OK';
  // Other tags (BH-26, BH-73, BH-435, BH-MG, BH-GOUNA, BH-NEWCAI, DXB)
  // are used as-is.
  return t;
}

/** Convenience: get the canonical building code for a listing row. */
export function getCanonicalBuilding(listing: BeithadyListing): string {
  return canonicalBuildingFromTag(listing.building_tag);
}

/** Exact nickname lookup (case-insensitive). */
export function getListingByNickname(
  nickname: string | null | undefined
): BeithadyListing | null {
  if (!nickname) return null;
  return byNickname.get(nickname.toUpperCase().trim()) || null;
}

/** Exact Guesty listing id lookup. */
export function getListingByGuestyId(
  id: string | null | undefined
): BeithadyListing | null {
  if (!id) return null;
  return byGuestyId.get(id.trim()) || null;
}

/**
 * Fuzzy match a free-text listing name (as shown in Airbnb line items,
 * review emails, inquiry emails, guest-request emails) against the catalog.
 * Strategy:
 *   1. Extract BH-xxx or BH73-xxx pattern, look up by nickname.
 *   2. Exact title match (normalized).
 *   3. Substring — the catalog title appears inside the input.
 * Returns null when no confident match.
 */
export function findListingByName(
  name: string | null | undefined
): BeithadyListing | null {
  if (!name) return null;
  // 1. BH-code pattern. Note BH73-... also matches.
  const m = name.match(/\bBH[-\s]?[A-Z0-9-]+\b/i);
  if (m) {
    const candidate = m[0].replace(/\s+/g, '').toUpperCase();
    // Try exact first
    const exact = byNickname.get(candidate);
    if (exact) return exact;
    // Also try progressively shorter matches (extracted substring might be
    // a prefix of the full nickname, or vice versa)
    for (const l of BEITHADY_LISTINGS) {
      const nick = l.nickname.toUpperCase();
      if (candidate === nick) return l;
      if (candidate.length >= 6 && nick.startsWith(candidate)) return l;
      if (nick.length >= 6 && candidate.startsWith(nick)) return l;
    }
  }
  // 2. Exact title
  const normalized = name.toLowerCase().trim();
  const titleHit = byTitle.get(normalized);
  if (titleHit) return titleHit;
  // 3. Substring — catalog title appears in input (rare but catches cases
  // where the email includes "...Luxury 3BR - Near EDNC..." with a date
  // suffix appended).
  for (const l of BEITHADY_LISTINGS) {
    const t = l.title.toLowerCase().trim();
    if (t.length >= 12 && normalized.includes(t)) return l;
  }
  return null;
}

/**
 * Shortcut: given a listing name, return its canonical building code (or
 * null if no confident match). Used by payout / review / inquiry / request
 * aggregators that only have listing names in email bodies.
 */
export function buildingFromListingName(
  name: string | null | undefined
): string | null {
  const listing = findListingByName(name);
  return listing ? getCanonicalBuilding(listing) : null;
}
