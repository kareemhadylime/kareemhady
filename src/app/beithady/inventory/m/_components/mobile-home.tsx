'use client';

import { useState, useTransition } from 'react';
import { Plus, Minus, LogOut, Check, AlertCircle, Camera, Trash2 } from 'lucide-react';
import { logoutMobileAction, postMobileIssueAction, type MobileIssueInput } from '../actions';
import type { MobileSession } from '@/lib/beithady/inventory/mobile-pin';

type Item = {
  id: string;
  sku: string;
  name_en: string;
  name_ar: string;
  uom: string;
  on_hand: number;
};

type Line = { item_id: string; qty: number; meta: Item | null };

const TYPE_LABEL: Record<MobileIssueInput['type'], string> = {
  per_reservation: 'صرف لحجز',
  maintenance_task: 'صيانة',
  welcome_tray: 'صينية ترحيب',
  damage_writeoff: 'تلف / كسر',
};

export function MobileHome({ session, items }: { session: MobileSession; items: Item[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ issue_no: string } | null>(null);

  const [type, setType] = useState<MobileIssueInput['type']>('per_reservation');
  const [refReservation, setRefReservation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  function addItem(it: Item) {
    setLines(ls => {
      const existing = ls.find(l => l.item_id === it.id);
      if (existing) return ls.map(l => l.item_id === it.id ? { ...l, qty: l.qty + 1 } : l);
      return [...ls, { item_id: it.id, qty: 1, meta: it }];
    });
    setPickerOpen(false);
    setPickerSearch('');
  }

  function bumpQty(itemId: string, delta: number) {
    setLines(ls => ls.map(l => l.item_id === itemId ? { ...l, qty: Math.max(0, l.qty + delta) } : l).filter(l => l.qty > 0));
  }

  function removeLine(itemId: string) {
    setLines(ls => ls.filter(l => l.item_id !== itemId));
  }

  async function submit() {
    setError(null);
    setSuccess(null);
    if (lines.length === 0) {
      setError('أضف صنفاً واحداً على الأقل');
      return;
    }
    if (type === 'damage_writeoff' && !photoUrl) {
      setError('التلف يحتاج صورة (إجباري)');
      return;
    }
    startTransition(async () => {
      const res = await postMobileIssueAction({
        type,
        ref_reservation_id: refReservation || undefined,
        notes: notes || undefined,
        photo_url: photoUrl || undefined,
        lines: lines.map(l => ({ item_id: l.item_id, qty: l.qty })),
      });
      if (res.ok) {
        setSuccess({ issue_no: res.issue_no });
        setLines([]);
        setRefReservation('');
        setNotes('');
        setPhotoUrl('');
      } else {
        setError(res.error);
      }
    });
  }

  const filtered = pickerSearch
    ? items.filter(it => it.name_ar.includes(pickerSearch) || it.name_en.toLowerCase().includes(pickerSearch.toLowerCase()) || it.sku.toLowerCase().includes(pickerSearch.toLowerCase()))
    : items;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 pb-32" style={{ fontFamily: '"Cairo", "Tajawal", "Amiri", sans-serif' }}>
      {/* Top bar */}
      <header className="bg-gradient-to-l from-cyan-700 to-emerald-600 text-white p-4 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs opacity-90">جلسة العمل</div>
            <div className="text-base font-bold">{session.cleanerName}</div>
            <div className="text-[11px] opacity-80 mt-0.5">{session.warehouseName} · {session.buildingCode}</div>
          </div>
          <form action={logoutMobileAction}>
            <button type="submit" className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded bg-white/20 hover:bg-white/30">
              <LogOut size={12} /> خروج
            </button>
          </form>
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Success banner */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-emerald-900 text-sm">
            <Check size={16} className="inline ml-1 text-emerald-600" />
            <strong>تم الإرسال</strong> · رقم الإذن {success.issue_no}. ينتظر الاعتماد من المدير.
          </div>
        )}

        {/* Type chips */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">نوع الصرف</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_LABEL) as Array<keyof typeof TYPE_LABEL>).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold ${
                  type === t ? 'bg-cyan-600 text-white border-cyan-600 shadow' : 'bg-white text-slate-700 border-slate-200'
                }`}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Reservation ID (only for per_reservation) */}
        {type === 'per_reservation' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">رقم الحجز (اختياري)</label>
            <input type="text" value={refReservation} onChange={e => setRefReservation(e.target.value)}
              placeholder="معرّف الحجز من Guesty"
              className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl font-mono focus:border-cyan-400 focus:outline-none" />
          </div>
        )}

        {/* Photo URL — required for damage */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2 inline-flex items-center gap-1">
            <Camera size={12} /> رابط الصورة {type === 'damage_writeoff' && <span className="text-rose-500">*</span>}
          </label>
          <input type="url" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:border-cyan-400 focus:outline-none" />
          <p className="text-[10px] text-slate-400 mt-1">سيتم دعم رفع مباشر من الكاميرا في النسخة القادمة. الآن انسخ رابط الصورة من واتساب أو جاليري.</p>
        </div>

        {/* Lines */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-slate-700">الأصناف ({lines.length})</label>
            <button type="button" onClick={() => setPickerOpen(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1">
              <Plus size={14} /> إضافة صنف
            </button>
          </div>
          {lines.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400 text-sm">
              لم تُضف أصناف بعد
            </div>
          ) : (
            <div className="space-y-2">
              {lines.map(l => (
                <div key={l.item_id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{l.meta?.name_ar}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{l.meta?.sku} · المتاح: {l.meta?.on_hand} {l.meta?.uom}</div>
                  </div>
                  <button type="button" onClick={() => bumpQty(l.item_id, -1)}
                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 inline-flex items-center justify-center hover:bg-slate-200">
                    <Minus size={16} />
                  </button>
                  <span className="text-xl font-bold tabular-nums w-12 text-center">{l.qty}</span>
                  <button type="button" onClick={() => bumpQty(l.item_id, 1)}
                    className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-200">
                    <Plus size={16} />
                  </button>
                  <button type="button" onClick={() => removeLine(l.item_id)}
                    className="w-10 h-10 rounded-full text-rose-600 inline-flex items-center justify-center hover:bg-rose-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">ملاحظات</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="مثل: لاستبدال منشفة تالفة"
            className="w-full px-4 py-3 text-sm border-2 border-slate-200 rounded-xl focus:border-cyan-400 focus:outline-none" />
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-700 text-sm inline-flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </main>

      {/* Sticky submit bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 shadow-lg">
        <button type="button" onClick={submit} disabled={pending || lines.length === 0}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
          <Check size={18} />
          {pending ? 'جارٍ الإرسال…' : `إرسال ${lines.length > 0 ? `(${lines.length} صنف)` : ''}`}
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-1">الطلب سيُعرض على المدير للاعتماد قبل خصم المخزون</p>
      </div>

      {/* Item picker overlay */}
      {pickerOpen && (
        <div dir="rtl" className="fixed inset-0 bg-slate-900/70 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-base">اختر الصنف</h3>
                <button type="button" onClick={() => { setPickerOpen(false); setPickerSearch(''); }} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
              </div>
              <input type="search" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الكود…"
                className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:border-cyan-400 focus:outline-none"
                autoFocus />
            </div>
            <div className="overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">لا توجد أصناف</div>
              ) : filtered.map(it => (
                <button key={it.id} type="button" onClick={() => addItem(it)}
                  className="w-full text-right p-3 rounded-lg hover:bg-emerald-50 active:bg-emerald-100 flex items-center justify-between gap-3 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{it.name_ar}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{it.sku}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-slate-700">{it.on_hand} {it.uom}</div>
                    <div className="text-[10px] text-slate-400">المتاح</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
