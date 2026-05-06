import 'server-only';
import { supabaseAdmin } from '../supabase';
import { sendWhatsApp } from '../whatsapp/green-api';

// Notification rendering + enqueue + send for boat-rental.
//
// Flow: state transition → enqueueNotifications() writes pending rows to
// boat_rental_notifications → flushPendingForReservation() fires them via
// Green-API in a best-effort loop. Failures don't block the state change.
//
// Templates are hardcoded here (not DB) because they're tightly coupled
// to the state machine and we want them versioned with the code.

export type TemplateKey =
  | 'booking_confirmed'
  | 'trip_details'
  | 'payment_received'
  | 'cancelled'
  | 'cancellation_requested'    // broker asked owner to approve a within-72h cancel
  | 'cancellation_resolved'     // owner approved/rejected the request
  | 'owner_block_confirmed'     // owner blocked dates for personal use — confirms back to owner
  | 'hold_warning'              // T-30min before a 2h hold expires
  | 'manual_reservation_created'  // owner created a reservation directly (no broker hold flow)
  | 'trip_payment_complete'       // trip payment ledger fully settled (auto-flip → paid_to_owner)
  | 'recurring_expense_generated' // recurring template auto-generated a new expense bill
  | 'trip_reminder_24h'            // T-24h Arabic reminder to skipper before trip
  | 'admin_signin_details';
export type Recipient = { userId?: string | null; phone: string; role: 'admin' | 'broker' | 'owner' | 'skipper' };

// Context used to render any template. Fields that don't apply to a
// specific template are ignored.
export type NotifContext = {
  boatName: string;
  bookingDate: string;          // 'YYYY-MM-DD' for EN; for owner_block_confirmed this can be a "FROM → TO" range string
  amountEgp?: number;
  brokerName?: string;
  clientName?: string;
  clientPhone?: string;
  guestCount?: number;
  tripReadyTime?: string;       // 'HH:MM'
  destination?: string;
  skipperName?: string;
  shortRef: string;             // short id of reservation for trace
  notes?: string | null;
  cancelledByRole?: 'admin' | 'broker' | 'owner';
  cancelledByName?: string;
  cancelReason?: string;        // for cancellation_requested + cancellation_resolved + owner_block_confirmed (block reason)
  expiresAt?: string;           // for hold_warning
  // trip_details cash-collection branch
  skipperCollectsCash?: boolean;
  skipperInstructions?: string | null;
  // manual_reservation_created
  ownerName?: string;
  // trip_payment_complete
  totalAmount?: number;
  paymentCount?: number;
  // recurring_expense_generated
  vendorName?: string | null;
  categoryLabel?: string;
  shortUrl?: string;
  // trip_reminder_24h
  destinationName?: string | null;
  // admin_signin_details
  username?: string;
  tempPassword?: string;
  signinRole?: string;        // 'broker' | 'owner' | 'admin'
  appUrl?: string;
  displayName?: string | null;
};

function fmtEgp(n?: number): string {
  if (n === undefined || n === null) return '—';
  return `EGP ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function notesLine(notes?: string | null, lang: 'en' | 'ar' = 'en'): string {
  const trimmed = (notes || '').trim();
  if (!trimmed) return '';
  return lang === 'ar' ? `\nملاحظات خاصة: ${trimmed}` : `\nNotes: ${trimmed}`;
}

// ---- Template renderers ----

function renderBookingConfirmed(ctx: NotifContext): string {
  return [
    'BOOKING CONFIRMED ✅',
    `Boat: ${ctx.boatName}`,
    `Date: ${ctx.bookingDate}`,
    `Amount: ${fmtEgp(ctx.amountEgp)}`,
    ctx.brokerName ? `Broker: ${ctx.brokerName}` : null,
    `Ref: #${ctx.shortRef}`,
  ]
    .filter(Boolean)
    .join('\n') + notesLine(ctx.notes, 'en');
}

function renderTripDetailsEn(ctx: NotifContext): string {
  const cashLine = ctx.skipperCollectsCash
    ? `\n💵 PAYMENT: Skipper collects ${fmtEgp(ctx.amountEgp)} cash from client before boarding. No broker transfer needed.`
    : '';
  const instrLine = ctx.skipperCollectsCash && ctx.skipperInstructions?.trim()
    ? `\nSkipper instructions: ${ctx.skipperInstructions.trim()}`
    : '';
  return [
    'TRIP DETAILS FILED 📋',
    `Boat: ${ctx.boatName}`,
    `Date: ${ctx.bookingDate}`,
    ctx.clientName ? `Client: ${ctx.clientName}${ctx.guestCount ? ` (${ctx.guestCount} guests)` : ''}` : null,
    ctx.clientPhone ? `Client phone: ${ctx.clientPhone}` : null,
    ctx.tripReadyTime ? `Ready: ${ctx.tripReadyTime}` : null,
    ctx.destination ? `Destination: ${ctx.destination}` : null,
    ctx.skipperName ? `Skipper: ${ctx.skipperName}` : null,
    `Ref: #${ctx.shortRef}`,
  ]
    .filter(Boolean)
    .join('\n') + cashLine + instrLine + notesLine(ctx.notes, 'en');
}

function renderTripDetailsAr(ctx: NotifContext): string {
  const cashLine = ctx.skipperCollectsCash
    ? `\n💵 تنبيه دفع: الرجاء تحصيل ${fmtEgp(ctx.amountEgp)} نقداً من العميل قبل ركوب المركب وتسليمها للمالك.`
    : '';
  const instrLine = ctx.skipperCollectsCash && ctx.skipperInstructions?.trim()
    ? `\nتعليمات إضافية: ${ctx.skipperInstructions.trim()}`
    : '';
  return [
    '🚤 رحلة جديدة',
    `المركب: ${ctx.boatName}`,
    `التاريخ: ${ctx.bookingDate}`,
    ctx.tripReadyTime ? `موعد الاستعداد: ${ctx.tripReadyTime}` : null,
    ctx.clientName ? `العميل: ${ctx.clientName}` : null,
    ctx.clientPhone ? `هاتف العميل: ${ctx.clientPhone}` : null,
    ctx.guestCount !== undefined ? `عدد الضيوف: ${ctx.guestCount}` : null,
    ctx.destination ? `الوجهة: ${ctx.destination}` : null,
    'الرجاء التأكد من جاهزية المركب.',
  ]
    .filter(Boolean)
    .join('\n') + cashLine + instrLine + notesLine(ctx.notes, 'ar');
}

function renderPaymentReceived(ctx: NotifContext): string {
  return [
    'PAYMENT RECEIVED 💰',
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    `Amount: ${fmtEgp(ctx.amountEgp)}`,
    `Ref: #${ctx.shortRef}`,
  ].join('\n');
}

function renderCancelled(ctx: NotifContext): string {
  const actor = ctx.cancelledByName
    ? `${ctx.cancelledByName} (${ctx.cancelledByRole || 'unknown'})`
    : (ctx.cancelledByRole || 'unknown');
  return [
    'BOOKING CANCELLED ❌',
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    `Cancelled by: ${actor}`,
    `Ref: #${ctx.shortRef}`,
  ].join('\n');
}

function renderCancellationRequested(ctx: NotifContext): string {
  return [
    'CANCELLATION REQUESTED ⚠️',
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    `Broker: ${ctx.brokerName || '—'}`,
    ctx.cancelReason ? `Reason: ${ctx.cancelReason}` : null,
    'This is within 72 hours of the booking — your approval is required.',
    `Open the app to approve or reject. Ref: #${ctx.shortRef}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderCancellationResolved(ctx: NotifContext): string {
  const isApproved = ctx.cancelReason === 'approved';
  return [
    isApproved ? 'CANCELLATION APPROVED ❌' : 'CANCELLATION REJECTED ✅',
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    isApproved
      ? 'The owner approved your cancellation request. The reservation has been cancelled.'
      : 'The owner declined the cancellation. The reservation stands.',
    `Ref: #${ctx.shortRef}`,
  ].join('\n');
}

function renderOwnerBlockConfirmed(ctx: NotifContext): string {
  return [
    'DATE BLOCKED 🔒',
    `Boat: ${ctx.boatName}`,
    `Date(s): ${ctx.bookingDate}`,
    ctx.cancelReason ? `Reason: ${ctx.cancelReason.replace(/_/g, ' ')}` : null,
    'Brokers will see this date as unavailable. You can remove the block from your calendar at any time before another reservation is made.',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderHoldWarning(ctx: NotifContext): string {
  return [
    '⏱ HOLD EXPIRING SOON',
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    `Your hold expires ${ctx.expiresAt || 'soon'}.`,
    'Confirm the booking now to keep the slot, or release it to free the date for others.',
    `Ref: #${ctx.shortRef}`,
  ].join('\n');
}

function renderManualReservationCreated(ctx: NotifContext): string {
  const skipperName = ctx.skipperName ?? 'there';
  const ownerName = ctx.ownerName ?? 'the owner';
  return [
    `Hi ${skipperName}, you're booked for a trip on ${ctx.bookingDate} on ${ctx.boatName}.`,
    `Owner (${ownerName}) will share trip details closer to the date.`,
    `Ref: #${ctx.shortRef}`,
  ].join('\n');
}

function renderTripPaymentComplete(ctx: NotifContext): string {
  const count = ctx.paymentCount ?? 1;
  const suffix = count === 1 ? '' : 's';
  const total = ctx.totalAmount ?? ctx.amountEgp ?? 0;
  return [
    `✅ Trip #${ctx.shortRef} fully paid.`,
    `Boat: ${ctx.boatName}  ·  Date: ${ctx.bookingDate}`,
    `Total received: ${fmtEgp(total)} (${count} payment${suffix})`,
  ].join('\n');
}

function renderRecurringExpenseGenerated(ctx: NotifContext): string {
  const label = ctx.vendorName ?? ctx.categoryLabel ?? 'Expense';
  const lines = [
    `🧾 New bill generated: ${label}`,
    `Amount: ${fmtEgp(ctx.amountEgp)}`,
    `Boat: ${ctx.boatName}`,
  ];
  if (ctx.shortUrl) lines.push(`Open in app to record payment: ${ctx.shortUrl}`);
  return lines.join('\n');
}

function renderAdminSigninDetails(ctx: NotifContext): string {
  const greeting = (ctx.displayName || ctx.username) ?? '';
  const role = ctx.signinRole || 'user';
  const appUrl = ctx.appUrl || 'https://app.limeinc.cc';
  return [
    `👋 Welcome to Lime Boat Rental, ${greeting}!`,
    '',
    `You've been added as a ${role}. Sign in details:`,
    '',
    `Username: ${ctx.username || '—'}`,
    `Temporary password: ${ctx.tempPassword || '—'}`,
    '',
    `Sign in: ${appUrl}/login`,
    '',
    `You'll be asked to change your password after first login.`,
    `For help, reply to this message.`,
  ].join('\n');
}

function renderTripReminder24hAr(ctx: NotifContext): string {
  const lines: string[] = [
    '🚤 تذكير: رحلة غدًا',
    '',
    `القارب: ${ctx.boatName}`,
    `التاريخ: ${ctx.bookingDate}`,
  ];
  if (ctx.tripReadyTime) lines.push(`وقت الانطلاق: ${ctx.tripReadyTime}`);
  if (ctx.destinationName) lines.push(`الوجهة: ${ctx.destinationName}`);
  if (ctx.clientName) {
    const guestPart = ctx.guestCount ? ` (${ctx.guestCount} ضيف)` : '';
    lines.push(`العميل: ${ctx.clientName}${guestPart}`);
  }
  if (ctx.skipperName) lines.push(`الكابتن: ${ctx.skipperName}`);
  if (ctx.notes) lines.push(`ملاحظات: ${ctx.notes}`);
  return lines.join('\n');
}

export function renderTemplate(
  key: TemplateKey,
  lang: 'en' | 'ar',
  ctx: NotifContext
): string {
  if (key === 'booking_confirmed') return renderBookingConfirmed(ctx);
  if (key === 'trip_details') return lang === 'ar' ? renderTripDetailsAr(ctx) : renderTripDetailsEn(ctx);
  if (key === 'payment_received') return renderPaymentReceived(ctx);
  if (key === 'cancelled') return renderCancelled(ctx);
  if (key === 'cancellation_requested') return renderCancellationRequested(ctx);
  if (key === 'cancellation_resolved') return renderCancellationResolved(ctx);
  if (key === 'owner_block_confirmed') return renderOwnerBlockConfirmed(ctx);
  if (key === 'hold_warning') return renderHoldWarning(ctx);
  if (key === 'manual_reservation_created') return renderManualReservationCreated(ctx);
  if (key === 'trip_payment_complete') return renderTripPaymentComplete(ctx);
  if (key === 'recurring_expense_generated') return renderRecurringExpenseGenerated(ctx);
  if (key === 'trip_reminder_24h') return renderTripReminder24hAr(ctx);
  if (key === 'admin_signin_details') return renderAdminSigninDetails(ctx);
  return '';
}

// ---- Enqueue + send ----

export async function enqueueNotification(args: {
  reservationId: string | null;          // null for non-reservation notifications (owner_block_confirmed)
  to: Recipient;
  templateKey: TemplateKey;
  language: 'en' | 'ar';
  context: NotifContext;
}): Promise<void> {
  const body = renderTemplate(args.templateKey, args.language, args.context);
  if (!body) return;
  const sb = supabaseAdmin();
  await sb.from('boat_rental_notifications').insert({
    reservation_id: args.reservationId,
    to_user_id: args.to.userId || null,
    to_phone: args.to.phone,
    to_role: args.to.role,
    channel: 'whatsapp',
    template_key: args.templateKey,
    language: args.language,
    rendered_body: body,
    status: 'pending',
  });
}

// Fires all pending notifications for a reservation right now. Best-
// effort; errors are logged on the row and don't throw. Intended to be
// called inline after a state transition so admins see "sent" in the UI
// without waiting for a cron.
export async function flushPendingForReservation(reservationId: string): Promise<{ sent: number; failed: number }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_notifications')
    .select('id, to_phone, rendered_body')
    .eq('reservation_id', reservationId)
    .eq('status', 'pending');
  return flushRows(sb, (data as Array<{ id: number; to_phone: string; rendered_body: string }> | null) || []);
}

// Flush all pending non-reservation notifications (e.g. recurring expense
// generated, ad-hoc owner messages). Bounded by `limit` to keep cron runs
// short — pending rows older than that get picked up on the next pass.
export async function flushPendingNonReservation(limit = 50): Promise<{ sent: number; failed: number }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_notifications')
    .select('id, to_phone, rendered_body')
    .is('reservation_id', null)
    .eq('status', 'pending')
    .order('id', { ascending: true })
    .limit(limit);
  return flushRows(sb, (data as Array<{ id: number; to_phone: string; rendered_body: string }> | null) || []);
}

async function flushRows(
  sb: ReturnType<typeof supabaseAdmin>,
  rows: Array<{ id: number; to_phone: string; rendered_body: string }>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await sendWhatsApp({ to: row.to_phone, message: row.rendered_body });
    if (result.ok) {
      sent++;
      await sb
        .from('boat_rental_notifications')
        .update({ status: 'sent', provider_msg_id: result.providerMessageId, sent_at: new Date().toISOString() })
        .eq('id', row.id);
    } else {
      failed++;
      await sb
        .from('boat_rental_notifications')
        .update({ status: 'failed', error: result.error })
        .eq('id', row.id);
    }
  }
  return { sent, failed };
}
