'use client';

import { useState, useTransition } from 'react';
import { ClipboardList, History, Settings as SettingsIcon, Send, Save, ExternalLink, Loader2 } from 'lucide-react';
import {
  SR_VERTICALS,
  AR_DAYS,
  defaultReportData,
  formatDate,
  type ShiftReportConfig,
  type ShiftReportData,
  type SectionKey,
  type ShiftKey,
  type VerticalKey,
  type VerticalConfig,
} from '@/lib/fmplus/shift-report/types';
import {
  saveShiftReportConfig,
  submitShiftReport,
  listShiftReports,
  type ShiftReportRow,
} from '@/lib/fmplus/shift-report/actions';

type TabKey = 'report' | 'history' | 'config';

interface Props {
  contractId:     number;
  projectName:    string;
  initialConfig:  ShiftReportConfig;
  initialHistory: ShiftReportRow[];
}

export function ShiftReportModule({ contractId, projectName, initialConfig, initialHistory }: Props) {
  const hasConfig = Object.values(initialConfig.verticals ?? {}).some((v) => v?.enabled);

  const [tab, setTab]         = useState<TabKey>(hasConfig ? 'report' : 'config');
  const [config, setConfig]   = useState<ShiftReportConfig>(initialConfig);
  const [report, setReport]   = useState<ShiftReportData>(defaultReportData);
  const [history, setHistory] = useState<ShiftReportRow[]>(initialHistory);
  const [toast, setToast]     = useState<string>('');
  const [pending, startTransition] = useTransition();

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  }

  function setRoleCount(section: SectionKey, vert: VerticalKey, role: string, raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setReport((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [vert]: { ...(prev[section][vert] ?? {}), [role]: v },
      },
    }));
  }

  function setPlanned(vert: VerticalKey, role: string, shiftKey: ShiftKey, raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setConfig((prev) => {
      const verticals = { ...(prev.verticals ?? {}) };
      const vc: VerticalConfig = verticals[vert] ?? { enabled: false, shifts: [], roles: {} };
      verticals[vert] = {
        ...vc,
        roles: { ...vc.roles, [role]: { ...vc.roles[role], [shiftKey]: v } },
      };
      return { ...prev, verticals };
    });
  }

  function toggleVertical(vert: VerticalKey) {
    setConfig((prev) => {
      const verticals = { ...(prev.verticals ?? {}) };
      const vc: VerticalConfig = verticals[vert] ?? { enabled: false, shifts: [], roles: {} };
      verticals[vert] = { ...vc, enabled: !vc.enabled };
      return { ...prev, verticals };
    });
  }

  function toggleShift(vert: VerticalKey, shiftKey: ShiftKey) {
    setConfig((prev) => {
      const verticals = { ...(prev.verticals ?? {}) };
      const vc: VerticalConfig = verticals[vert] ?? { enabled: false, shifts: [], roles: {} };
      const has = vc.shifts.includes(shiftKey);
      verticals[vert] = { ...vc, shifts: has ? vc.shifts.filter((s) => s !== shiftKey) : [...vc.shifts, shiftKey] };
      return { ...prev, verticals };
    });
  }

  function handleSaveConfig() {
    if (!config.contractNumber) { flash('❗ أدخل رقم العقد'); return; }
    startTransition(async () => {
      try {
        await saveShiftReportConfig(contractId, config);
        flash('✓ تم حفظ الإعدادات');
        setTimeout(() => setTab('report'), 600);
      } catch (e) {
        flash('✗ فشل الحفظ: ' + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  function handleSendReport() {
    if (!config.waGroup) { flash('❗ لم يتم تعيين مجموعة واتساب'); return; }
    startTransition(async () => {
      try {
        const res = await submitShiftReport({
          contractId,
          projectName,
          data: report,
        });
        if (res.ok) {
          flash(res.waSent
            ? '✓ تم إرسال التقرير ورابط التفاصيل'
            : '✓ تم حفظ التقرير (لكن فشل إرسال واتساب: ' + (res.waError ?? 'غير معروف') + ')');
          setReport(defaultReportData());
          // refresh history
          const fresh = await listShiftReports(contractId, 30);
          setHistory(fresh);
        } else {
          flash('✗ فشل: ' + (res.waError ?? res.uploadError ?? 'unknown'));
        }
      } catch (e) {
        flash('✗ خطأ: ' + (e instanceof Error ? e.message : String(e)));
      }
    });
  }

  const today = new Date();
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);

  const TABS: { key: TabKey; ar: string; Icon: typeof ClipboardList }[] = [
    { key: 'report',  ar: 'تقرير اليوم', Icon: ClipboardList },
    { key: 'history', ar: 'السجل',        Icon: History },
    { key: 'config',  ar: 'الإعدادات',    Icon: SettingsIcon },
  ];

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-lg shadow-2xl border border-fmplus-gold/40 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* Tab bar */}
      <div className="ix-card overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition border-b-2 ' +
                  (active
                    ? 'border-fmplus-gold text-fmplus-gold dark:text-fmplus-yellow dark:border-fmplus-yellow'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')
                }
              >
                <t.Icon size={16} />
                <span>{t.ar}</span>
              </button>
            );
          })}
        </div>

        {/* ── Report tab ─────────────────────────────────────────── */}
        {tab === 'report' && (
          <div dir="rtl" className="p-5 space-y-4">
            <div className="rounded-lg bg-fmplus-yellow/8 dark:bg-fmplus-gold/10 border border-fmplus-gold/30 p-3 flex justify-between items-center">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{projectName}</div>
                {config.contractNumber && (
                  <div className="text-xs text-slate-500 mt-0.5">رقم العقد: {config.contractNumber}</div>
                )}
                <div className="text-xs text-slate-500">{AR_DAYS[today.getDay()]} — {formatDate(today)}</div>
              </div>
              <div className="text-2xl">📋</div>
            </div>

            <ShiftSection
              title="اليوم — الصباحية"
              emoji="🌅"
              dayLabel={AR_DAYS[today.getDay()]}
              dateLabel={formatDate(today)}
              section="today_morning"
              shiftKey="morning"
              tone="gold"
              config={config}
              data={report}
              onChange={setRoleCount}
            />
            <ShiftSection
              title="أمس — الصباحية"
              emoji="🌅"
              dayLabel={AR_DAYS[yest.getDay()]}
              dateLabel={formatDate(yest)}
              section="yesterday_morning"
              shiftKey="morning"
              tone="blue"
              config={config}
              data={report}
              onChange={setRoleCount}
            />
            <ShiftSection
              title="أمس — المسائية"
              emoji="🌙"
              dayLabel={AR_DAYS[yest.getDay()]}
              dateLabel={formatDate(yest)}
              section="yesterday_night"
              shiftKey="night"
              tone="purple"
              config={config}
              data={report}
              onChange={setRoleCount}
            />

            <button
              onClick={handleSendReport}
              disabled={pending}
              className="w-full bg-fmplus-gold text-fmplus-black hover:bg-fmplus-yellow disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {pending
                ? (<><Loader2 size={16} className="animate-spin" /> جاري الإرسال...</>)
                : (<><Send size={16} /> إرسال تقرير الوردية</>)}
            </button>

            {!hasConfig && (
              <div className="text-center text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3">
                ⚠️ لم يتم إعداد المشروع بعد — انتقل إلى الإعدادات لتفعيل الخدمات وتعيين مجموعة واتساب
              </div>
            )}
          </div>
        )}

        {/* ── History tab ────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              سجل التقارير المُرسلة
            </h3>
            {history.length === 0 ? (
              <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-10">
                لا توجد تقارير مُرسلة بعد
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((rep) => (
                  <div
                    key={rep.id}
                    className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {rep.report_date}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {rep.submitted_by || '—'} ·{' '}
                        {new Date(rep.submitted_at).toLocaleTimeString('en-GB', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                    {rep.report_url && (
                      <a
                        href={rep.report_url}
                        target="_blank"
                        rel="noopener"
                        className="text-xs font-semibold text-fmplus-gold hover:text-fmplus-yellow flex items-center gap-1 px-3 py-1.5 rounded-md border border-fmplus-gold/40 hover:bg-fmplus-yellow/10"
                      >
                        <ExternalLink size={12} /> فتح التفاصيل
                      </a>
                    )}
                    <span
                      className={
                        'text-[10px] font-bold px-2 py-1 rounded ' +
                        (rep.wa_sent
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')
                      }
                    >
                      {rep.wa_sent ? '✓ أُرسل' : 'لم يُرسل'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Config tab ─────────────────────────────────────────── */}
        {tab === 'config' && (
          <div dir="rtl" className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              إعداد تقارير الوردية
            </h3>

            {/* Contract + WA */}
            <div className="ix-card p-4 space-y-3">
              <div className="text-xs font-bold text-fmplus-gold dark:text-fmplus-yellow mb-1">
                معلومات المشروع
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                  رقم العقد *
                </label>
                <input
                  type="text"
                  value={config.contractNumber ?? ''}
                  onChange={(e) => setConfig((p) => ({ ...p, contractNumber: e.target.value }))}
                  placeholder="مثال: CON-2026-014"
                  dir="ltr"
                  className="ix-input w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                  مجموعة واتساب للتقارير
                </label>
                <input
                  type="text"
                  value={config.waGroup ?? ''}
                  onChange={(e) => setConfig((p) => ({ ...p, waGroup: e.target.value }))}
                  placeholder="رقم الهاتف أو Group ID مثل 120363XXXX@g.us"
                  dir="ltr"
                  className="ix-input w-full text-sm"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  يمكن إدخال رقم هاتف (01XXXXXXXXX) أو Group Chat ID
                </div>
              </div>
            </div>

            {/* Verticals */}
            {SR_VERTICALS.map((v) => {
              const vc = config.verticals[v.key] ?? { enabled: false, shifts: [], roles: {} };
              return (
                <div
                  key={v.key}
                  className={
                    'ix-card p-4 ' +
                    (vc.enabled ? 'border-fmplus-gold/50 dark:border-fmplus-yellow/50' : '')
                  }
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={
                      'text-sm font-bold ' +
                      (vc.enabled ? 'text-fmplus-gold dark:text-fmplus-yellow' : 'text-slate-700 dark:text-slate-300')
                    }>
                      {v.icon} {v.nameAr}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleVertical(v.key)}
                      className={
                        'text-xs font-bold px-3 py-1 rounded border transition ' +
                        (vc.enabled
                          ? 'bg-fmplus-yellow/20 border-fmplus-gold text-fmplus-gold'
                          : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-400')
                      }
                    >
                      {vc.enabled ? '✓ مفعّل' : 'تفعيل'}
                    </button>
                  </div>

                  {vc.enabled && (
                    <>
                      {/* Shift toggles */}
                      <div className="flex gap-2 mb-3">
                        {(['morning', 'night'] as ShiftKey[]).map((sk) => {
                          const ar = sk === 'morning' ? 'الصباحية' : 'المسائية';
                          const active = vc.shifts.includes(sk);
                          return (
                            <button
                              key={sk}
                              type="button"
                              onClick={() => toggleShift(v.key, sk)}
                              className={
                                'text-xs font-medium px-3 py-1 rounded border transition ' +
                                (active
                                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-300 font-bold'
                                  : 'border-slate-300 dark:border-slate-600 text-slate-500 hover:border-slate-400')
                              }
                            >
                              {sk === 'morning' ? '🌅' : '🌙'} {ar}
                            </button>
                          );
                        })}
                      </div>

                      {/* Planned headcount per role */}
                      {vc.shifts.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                            الأعداد التعاقدية (مخطط):
                          </div>
                          <div className="space-y-1">
                            {v.roles.map((role) => {
                              const rVals = vc.roles[role.key] ?? {};
                              return (
                                <div
                                  key={role.key}
                                  className="flex items-center gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                                >
                                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300">
                                    {role.labelAr}
                                  </span>
                                  {vc.shifts.includes('morning') && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-slate-500">ص</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={rVals.morning ?? 0}
                                        onChange={(e) => setPlanned(v.key, role.key, 'morning', e.target.value)}
                                        className="ix-input w-14 text-sm text-center"
                                      />
                                    </div>
                                  )}
                                  {vc.shifts.includes('night') && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-slate-500">م</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={rVals.night ?? 0}
                                        onChange={(e) => setPlanned(v.key, role.key, 'night', e.target.value)}
                                        className="ix-input w-14 text-sm text-center"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            <button
              onClick={handleSaveConfig}
              disabled={pending}
              className="w-full bg-fmplus-gold text-fmplus-black hover:bg-fmplus-yellow disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition"
            >
              {pending
                ? (<><Loader2 size={16} className="animate-spin" /> جاري الحفظ...</>)
                : (<><Save size={16} /> حفظ الإعدادات</>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sub-component: one shift section in the daily form ───────────────── */

interface ShiftSectionProps {
  title:     string;
  emoji:     string;
  dayLabel:  string;
  dateLabel: string;
  section:   SectionKey;
  shiftKey:  ShiftKey;
  tone:      'gold' | 'blue' | 'purple';
  config:    ShiftReportConfig;
  data:      ShiftReportData;
  onChange:  (section: SectionKey, vert: VerticalKey, role: string, raw: string) => void;
}

function ShiftSection({ title, emoji, dayLabel, dateLabel, section, shiftKey, tone, config, data, onChange }: ShiftSectionProps) {
  const vcfg = config.verticals ?? {};
  const activeVerts = SR_VERTICALS.filter((v) => {
    const vc = vcfg[v.key];
    return vc?.enabled && vc.shifts.includes(shiftKey);
  });

  const toneClass = tone === 'gold'
    ? 'text-fmplus-gold dark:text-fmplus-yellow border-fmplus-gold/40'
    : tone === 'blue'
      ? 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700'
      : 'text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700';

  return (
    <div className={'border rounded-lg p-3 ' + toneClass}>
      <div className={'text-sm font-bold mb-3 flex items-center gap-2 ' + toneClass}>
        {emoji} {title}
        <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
          {dayLabel} — {dateLabel}
        </span>
      </div>

      {activeVerts.length === 0 ? (
        <div className="text-xs text-slate-500 italic py-2">
          لا توجد خدمات مفعّلة لهذه الوردية
        </div>
      ) : (
        activeVerts.map((v) => {
          const vc = vcfg[v.key]!;
          const sData = data[section][v.key] ?? {};
          return (
            <div key={v.key} className="mb-3">
              <div className="text-xs font-bold text-fmplus-gold dark:text-fmplus-yellow mb-1 pb-1 border-b border-slate-200 dark:border-slate-700">
                {v.icon} {v.nameAr}
              </div>
              {v.roles.map((role) => {
                const planned = vc.roles[role.key]?.[shiftKey] ?? 0;
                return (
                  <div
                    key={role.key}
                    className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{role.labelAr}</span>
                    <span className="text-[10px] text-slate-500 mx-2">(مخطط: {planned})</span>
                    <input
                      type="number"
                      min={0}
                      value={sData[role.key] ?? 0}
                      onChange={(e) => onChange(section, v.key, role.key, e.target.value)}
                      className="ix-input w-16 text-sm text-center"
                    />
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
