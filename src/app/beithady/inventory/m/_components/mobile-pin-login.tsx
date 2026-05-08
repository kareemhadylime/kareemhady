'use client';

import { useState, useTransition } from 'react';
import { Lock, Building2, AlertCircle, Package } from 'lucide-react';
import { loginMobileAction } from '../actions';

type Building = {
  warehouseCode: string;
  warehouseId: string;
  warehouseName: string;
  buildingCode: string | null;
};

export function MobilePinLogin({ buildings }: { buildings: Building[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warehouseCode, setWarehouseCode] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [cleanerName, setCleanerName] = useState<string>('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('warehouse_code', warehouseCode);
    fd.set('pin', pin);
    fd.set('cleaner_name', cleanerName);
    startTransition(async () => {
      const res = await loginMobileAction(fd);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 flex items-center justify-center p-4 font-arabic" style={{ fontFamily: '"Cairo", "Tajawal", "Amiri", sans-serif' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        {/* Branding */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 text-white mb-2">
            <Package size={28} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--bh-navy)' }}>بيت هادي · المخزن</h1>
          <p className="text-xs text-slate-500 mt-1">سجّل الدخول لتسجيل الصرف والجرد</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Building chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 inline-flex items-center gap-1">
              <Building2 size={12} /> اختر المبنى
            </label>
            <div className="grid grid-cols-2 gap-2">
              {buildings.map(b => (
                <button
                  key={b.warehouseCode}
                  type="button"
                  onClick={() => setWarehouseCode(b.warehouseCode)}
                  className={`px-3 py-3 rounded-xl border-2 text-sm font-bold transition ${
                    warehouseCode === b.warehouseCode
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  {b.buildingCode}
                </button>
              ))}
            </div>
          </div>

          {/* Cleaner name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">الاسم</label>
            <input
              type="text"
              value={cleanerName}
              onChange={e => setCleanerName(e.target.value)}
              placeholder="مثال: آية"
              required
              minLength={2}
              className="w-full px-4 py-3 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 focus:outline-none"
            />
          </div>

          {/* PIN — large numeric input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2 inline-flex items-center gap-1">
              <Lock size={12} /> الرمز السري (6 أرقام)
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              required
              maxLength={6}
              minLength={6}
              className="w-full px-4 py-4 text-2xl font-mono tracking-widest text-center border-2 border-slate-200 rounded-xl focus:border-emerald-400 focus:outline-none"
              dir="ltr"
            />
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-700 text-sm inline-flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !warehouseCode || pin.length !== 6 || cleanerName.length < 2}
            className="w-full px-4 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>

        <p className="text-[10px] text-center text-slate-400">
          جلسة العمل صالحة 4 ساعات. يمكن تدويم الرمز من قبل المدير.
        </p>
      </div>
    </div>
  );
}
