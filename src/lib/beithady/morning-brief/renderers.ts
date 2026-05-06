import type { Brief, BriefRole } from './types';

const ROLE_TITLE_EN: Record<BriefRole, string> = {
  guest_relations: 'Guest Relations',
  ops: 'Housekeeping & Operations',
  finance: 'Finance & Accounting',
};

const ROLE_TITLE_AR: Record<BriefRole, string> = {
  guest_relations: 'علاقات الضيوف',
  ops: 'الإشراف والعمليات',
  finance: 'الحسابات والمالية',
};

const I18N = {
  en: {
    headline: 'Beit Hady — Morning Brief',
    view_full: 'View full brief',
    view_web: 'View on the web',
    plus_more: (n: number) => `+ ${n} more — see web view`,
  },
  ar: {
    headline: 'بيت هادي — موجز الصباح',
    view_full: 'عرض الموجز الكامل',
    view_web: 'فتح على الويب',
    plus_more: (n: number) => `+ ${n} إضافية — راجع نسخة الويب`,
  },
} as const;

// WhatsApp markdown — keep it short, mobile-optimised. RTL languages
// (Arabic) work natively in WhatsApp; we just emit the Arabic strings
// and the client renders right-to-left.
export function renderMarkdown(brief: Brief, baseUrl?: string): string {
  const t = I18N[brief.language];
  const roleTitle = brief.language === 'ar' ? ROLE_TITLE_AR[brief.role] : ROLE_TITLE_EN[brief.role];
  const lines: string[] = [];
  lines.push(`*${t.headline}*`);
  lines.push(`${roleTitle} · ${brief.cairo_label}`);
  lines.push('');

  for (const sec of brief.sections) {
    if (sec.items.length === 0) {
      if (sec.empty_message) {
        lines.push(`${sec.emoji} *${sec.title}* — _${sec.empty_message}_`);
        lines.push('');
      }
      continue;
    }
    lines.push(`${sec.emoji} *${sec.title}*`);
    for (const it of sec.items.slice(0, 8)) {
      const tag = it.tag ? ` [${it.tag.label}]` : '';
      lines.push(`• ${it.primary}${tag}`);
      if (it.secondary) lines.push(`   _${it.secondary}_`);
    }
    if (sec.items.length > 8) {
      lines.push(`_${t.plus_more(sec.items.length - 8)}_`);
    }
    lines.push('');
  }

  const url = baseUrl
    ? `${baseUrl}/beithady/operations/morning-brief?role=${brief.role}&date=${brief.date_iso}`
    : null;
  if (url) {
    lines.push(`${t.view_full}: ${url}`);
  }

  // Canonical-metric transparency footer — every brief discloses its filter
  // semantics so the team can sanity-check at a glance against Guesty UI.
  lines.push('');
  lines.push(
    brief.language === 'ar'
      ? '_المصدر: guesty-metrics · status=confirmed/checked\\_in/checked\\_out · stay = check\\_in≤today<check\\_out · الحجوزات اليدوية مدرجة منفصلة_'
      : '_Source: guesty-metrics · status=confirmed/checked_in/checked_out · stay = check_in≤today<check_out · owner+manual blocks listed separately_'
  );

  return lines.join('\n');
}

// Email HTML — clean inbox-friendly layout. For Arabic briefs we set
// dir="rtl" + lang="ar" + an Arabic system-font stack.
export function renderHtml(brief: Brief, baseUrl?: string): string {
  const t = I18N[brief.language];
  const roleTitle = brief.language === 'ar' ? ROLE_TITLE_AR[brief.role] : ROLE_TITLE_EN[brief.role];
  const isRtl = brief.language === 'ar';
  const sections = brief.sections.map(sec => {
    if (sec.items.length === 0) {
      return sec.empty_message
        ? `<div style="margin:16px 0;padding:12px;background:#f8fafc;border-radius:6px;color:#64748b;font-size:13px;">
             <strong>${escapeHtml(sec.emoji)} ${escapeHtml(sec.title)}</strong> — ${escapeHtml(sec.empty_message)}
           </div>`
        : '';
    }
    const items = sec.items.map(it => `
      <li style="margin:6px 0;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:4px;">
        <div style="font-weight:600;color:#0f172a;">${escapeHtml(it.primary)}${it.tag ? ` <span style="font-size:10px;padding:2px 6px;background:${tagBg(it.tag.tone)};color:#fff;border-radius:3px;">${escapeHtml(it.tag.label)}</span>` : ''}</div>
        ${it.secondary ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(it.secondary)}</div>` : ''}
      </li>
    `).join('');
    return `
      <div style="margin:20px 0;">
        <h3 style="margin:0 0 8px;color:#1e2d4a;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;">
          ${escapeHtml(sec.emoji)} ${escapeHtml(sec.title)}
        </h3>
        <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
      </div>
    `;
  }).join('');

  const url = baseUrl
    ? `${baseUrl}/beithady/operations/morning-brief?role=${brief.role}&date=${brief.date_iso}`
    : null;

  const fontStack = isRtl
    ? `'Segoe UI','Tahoma','Cairo','Amiri','Geeza Pro',-apple-system,sans-serif`
    : `-apple-system,'Segoe UI',sans-serif`;

  return `
<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'en'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<body style="font-family:${fontStack};background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e2e8f0;">
    <div style="border-bottom:2px solid #1e2d4a;padding-bottom:12px;margin-bottom:16px;">
      <h1 style="margin:0;color:#1e2d4a;font-size:20px;">${escapeHtml(t.headline)}</h1>
      <p style="margin:4px 0 0;color:#64748b;font-size:13px;">
        ${escapeHtml(roleTitle)} · ${escapeHtml(brief.cairo_label)}
      </p>
    </div>
    ${sections}
    ${url ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;">
      <a href="${url}" style="color:#1e2d4a;text-decoration:none;font-size:12px;">${escapeHtml(t.view_web)}</a>
    </div>` : ''}
    <div style="margin-top:12px;padding-top:8px;border-top:1px dashed #e2e8f0;text-align:center;color:#94a3b8;font-size:10px;font-style:italic;">
      ${isRtl
        ? 'المصدر: guesty-metrics · status=confirmed/checked_in/checked_out · stay = check_in≤today&lt;check_out · الحجوزات اليدوية مدرجة منفصلة'
        : 'Source: guesty-metrics · status=confirmed/checked_in/checked_out · stay = check_in≤today&lt;check_out · owner+manual blocks listed separately'}
    </div>
  </div>
</body></html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

function tagBg(tone: 'red' | 'amber' | 'green' | 'violet' | 'cyan' | 'slate'): string {
  return {
    red: '#dc2626', amber: '#d97706', green: '#16a34a',
    violet: '#7c3aed', cyan: '#0891b2', slate: '#64748b',
  }[tone];
}
