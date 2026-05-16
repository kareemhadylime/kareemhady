// Single source of truth for all togglable panels on the Performance Dashboard.
// Used by the Customize drawer to render the toggle list, and by the visibility
// hook to validate stored panel IDs against the canonical set.

export type PanelId =
  | 'ai-insights'
  | 'daily-activity'
  | 'top-movers'
  | 'hero-occupancy'
  | 'hero-mtd-occupancy'
  | 'hero-month-to-end-occupancy'
  | 'hero-month-occupancy'
  | 'hero-mtd-revenue'
  | 'hero-mtd-revenue-gross'
  | 'hero-mtd-revenue-actual'
  | 'hero-revpar'
  | 'hero-pace'
  | 'hero-reviews-avg'
  | 'hero-response-time'
  | 'buildings-table'
  | 'channel-mix'
  | 'payouts'
  | 'reviews-block'
  | 'cleaning-turnovers'
  | 'inquiry-sla'
  | 'check-ins-payment'
  | 'cancellations'
  | 'forward-occupancy'
  | 'cancel-risk'
  | 'monthly-goal'
  | 'revenue-concentration'
  | 'occupancy-gap-finder'
  | 'revenue-waterfall'
  | 'stly-yoy'
  | 'snapshot-scrubber';

export type PanelGroupId =
  | 'hero'
  | 'decisions-alerts'
  | 'revenue-financials'
  | 'operations-guests';

export type PanelDescriptor = {
  id: PanelId;
  label: string;
  group: PanelGroupId;
  /** Off by default per spec (mini-map, snapshot scrubber, etc.). */
  defaultVisible: boolean;
};

export const PANEL_GROUPS: Record<PanelGroupId, string> = {
  'hero': 'Hero KPIs',
  'decisions-alerts': 'Decisions & alerts',
  'revenue-financials': 'Revenue & financials',
  'operations-guests': 'Operations & guests',
};

export const PANELS: PanelDescriptor[] = [
  // Daily activity strip — top-of-fold operational glance
  { id: 'daily-activity', label: '📅 Daily activity (check-ins / outs / turnovers / staying)', group: 'operations-guests', defaultVisible: true },

  // Hero (always-on by default — these are the morning glance)
  { id: 'hero-occupancy', label: 'Occupancy today', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-occupancy', label: 'MTD Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-month-to-end-occupancy', label: 'Month-to-End Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-month-occupancy', label: 'Month Occupancy', group: 'hero', defaultVisible: true },
  { id: 'hero-pace', label: 'Pace', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-revenue-actual', label: 'MTD Revenue (actual)', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-revenue', label: 'Month Revenue (OTB, net payout)', group: 'hero', defaultVisible: true },
  { id: 'hero-mtd-revenue-gross', label: 'Month Revenue (Gross, matches Guesty)', group: 'hero', defaultVisible: true },
  { id: 'hero-revpar', label: 'RevPAR', group: 'hero', defaultVisible: true },
  { id: 'hero-reviews-avg', label: 'Reviews avg', group: 'hero', defaultVisible: true },
  { id: 'hero-response-time', label: 'Response time', group: 'hero', defaultVisible: true },

  // Decisions & alerts
  { id: 'ai-insights', label: '✨ AI Insights tray', group: 'decisions-alerts', defaultVisible: true },
  { id: 'top-movers', label: '📈 Top movers ribbon', group: 'decisions-alerts', defaultVisible: true },
  { id: 'cancel-risk', label: '⚠ Cancel risk', group: 'decisions-alerts', defaultVisible: true },
  { id: 'occupancy-gap-finder', label: '🔍 Occupancy gap finder', group: 'decisions-alerts', defaultVisible: true },

  // Revenue & financials
  { id: 'buildings-table', label: '🏢 Buildings table', group: 'revenue-financials', defaultVisible: true },
  { id: 'forward-occupancy', label: '📅 Forward occupancy bars', group: 'revenue-financials', defaultVisible: true },
  { id: 'channel-mix', label: '📊 Channel mix donut', group: 'revenue-financials', defaultVisible: true },
  { id: 'payouts', label: '💸 Payouts', group: 'revenue-financials', defaultVisible: true },
  { id: 'monthly-goal', label: '🎯 Monthly goal', group: 'revenue-financials', defaultVisible: true },
  { id: 'revenue-concentration', label: '📊 Revenue concentration Pareto', group: 'revenue-financials', defaultVisible: true },
  { id: 'revenue-waterfall', label: '💧 Revenue waterfall', group: 'revenue-financials', defaultVisible: false },
  { id: 'stly-yoy', label: '📅 STLY YoY comparison', group: 'revenue-financials', defaultVisible: false },

  // Operations & guests
  { id: 'reviews-block', label: '⭐ Reviews block (with AI topics)', group: 'operations-guests', defaultVisible: true },
  { id: 'cleaning-turnovers', label: '🧹 Cleaning turnovers today', group: 'operations-guests', defaultVisible: true },
  { id: 'inquiry-sla', label: '📥 Inquiry SLA buckets', group: 'operations-guests', defaultVisible: true },
  { id: 'check-ins-payment', label: '💰 Check-ins with payment', group: 'operations-guests', defaultVisible: true },
  { id: 'cancellations', label: '❌ Cancellations', group: 'operations-guests', defaultVisible: true },

  // Decisions & alerts (time-travel)
  { id: 'snapshot-scrubber', label: '⏪ Snapshot scrubber', group: 'decisions-alerts', defaultVisible: false },
];

export const PANEL_IDS: PanelId[] = PANELS.map((p) => p.id);

export function defaultVisibility(): Record<PanelId, boolean> {
  return Object.fromEntries(PANELS.map((p) => [p.id, p.defaultVisible])) as Record<PanelId, boolean>;
}
