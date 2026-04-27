import { NextRequest, NextResponse } from 'next/server';
import { createLead, type LeadSource } from '@/lib/beithady/pipeline/leads';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_ORIGINS = (process.env.LEAD_INTAKE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

function corsHeaders(origin: string | null): HeadersInit {
  // Allow any origin if not configured (open intake), else allowlist
  const allow = ALLOWED_ORIGINS.length === 0 ? '*' : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: corsHeaders(origin) });
  }

  // Honeypot — if a hidden field is filled, silently 200 to confuse bots
  if (typeof body.website === 'string' && body.website.length > 0) {
    return NextResponse.json({ ok: true, lead_id: 'honeypot' }, { status: 200, headers: corsHeaders(origin) });
  }

  const source: LeadSource = (typeof body.source === 'string' && ['website','whatsapp','instagram','manual','ads','referral','agent','direct_inquiry'].includes(body.source))
    ? (body.source as LeadSource)
    : 'website';

  const fullName = typeof body.name === 'string' ? body.name : (typeof body.full_name === 'string' ? body.full_name : null);
  const email = typeof body.email === 'string' ? body.email : null;
  const phone = typeof body.phone === 'string' ? body.phone : null;
  const message = typeof body.message === 'string' ? body.message : null;

  if (!email && !phone) {
    return NextResponse.json({ ok: false, error: 'missing_email_or_phone' }, { status: 400, headers: corsHeaders(origin) });
  }

  // Travel dates parsing — accept either nested or flat
  type TravelDates = { check_in?: string; check_out?: string; nights?: number; guests?: number };
  let travelDates: TravelDates | null = null;
  if (body.travel_dates && typeof body.travel_dates === 'object') {
    travelDates = body.travel_dates as TravelDates;
  } else if (typeof body.check_in === 'string' || typeof body.check_out === 'string') {
    travelDates = {
      check_in: typeof body.check_in === 'string' ? body.check_in : undefined,
      check_out: typeof body.check_out === 'string' ? body.check_out : undefined,
      nights: typeof body.nights === 'number' ? body.nights : undefined,
      guests: typeof body.guests === 'number' ? body.guests : undefined,
    };
  }

  const result = await createLead({
    source,
    source_external_id: typeof body.source_id === 'string' ? body.source_id : null,
    full_name: fullName,
    email,
    phone,
    message,
    listing_interest: typeof body.listing_interest === 'string' ? body.listing_interest : null,
    building_interest: typeof body.building_interest === 'string' ? body.building_interest : null,
    travel_dates: travelDates,
    budget_usd: typeof body.budget_usd === 'number' ? body.budget_usd : null,
    raw_payload: { headers: { origin, ua: req.headers.get('user-agent') || null }, body },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400, headers: corsHeaders(origin) });
  }

  await recordAudit({
    module: 'crm',
    action: 'lead_intake',
    target_type: 'lead',
    target_id: result.lead_id,
    metadata: { source, origin },
  });

  return NextResponse.json({ ok: true, lead_id: result.lead_id }, { status: 201, headers: corsHeaders(origin) });
}
