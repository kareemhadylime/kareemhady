'use client';

import { useMemo, useState } from 'react';
import { createExpenseAction } from '../actions';

type Boat = { id: string; name: string };
type Skipper = { id: string; name: string; boat_id: string };
type Reservation = { id: string; booking_date: string; boat_id: string };
type OwnerSettings = {
  default_fuel_price_per_l: number | null;
  preferred_marina_vendor: string | null;
};

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'amenities', label: 'Amenities (trip)' },
  { value: 'part_time_skipper', label: 'Part-time skipper (trip)' },
  { value: 'marina_docking', label: 'Marina docking' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'boat_license', label: 'Boat license' },
  { value: 'full_time_skipper_salary', label: 'Full-time skipper salary' },
  { value: 'maintenance_contract', label: 'Maintenance contract' },
  { value: 'other', label: 'Other' },
];

export function ExpenseForm({
  boats,
  skippers,
  reservations,
  settings,
  defaultBoatId,
  todayCairo,
}: {
  boats: Boat[];
  skippers: Skipper[];
  reservations: Reservation[];
  settings: OwnerSettings | null;
  defaultBoatId?: string;
  todayCairo: string;
}) {
  const [boatId, setBoatId] = useState(defaultBoatId ?? boats[0]?.id ?? '');
  const [category, setCategory] = useState<string>('fuel');
  const [payNow, setPayNow] = useState(true);
  const [fuelLiters, setFuelLiters] = useState('');
  const [fuelPrice, setFuelPrice] = useState(
    settings?.default_fuel_price_per_l != null ? String(settings.default_fuel_price_per_l) : ''
  );
  const [fuelTips, setFuelTips] = useState('');
  const [amount, setAmount] = useState('');

  const boatSkippers = useMemo(
    () => skippers.filter((s) => s.boat_id === boatId),
    [skippers, boatId]
  );
  const boatReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.boat_id === boatId)
        .sort((a, b) => b.booking_date.localeCompare(a.booking_date)),
    [reservations, boatId]
  );

  const fuelSubtotal = (Number(fuelLiters) || 0) * (Number(fuelPrice) || 0);
  const fuelTotal = fuelSubtotal + (Number(fuelTips) || 0);
  const computedAmount = category === 'fuel' ? String(fuelTotal) : amount;

  const showTripPicker = category === 'amenities' || category === 'part_time_skipper';
  const showSkipperPicker = category === 'part_time_skipper';
  const showFuelInputs = category === 'fuel';
  const showVendor = category === 'marina_docking';
  const showAmount = category !== 'fuel';
  const requireDescription = category === 'repair';

  return (
    <form action={createExpenseAction} className="space-y-3">
      <label className="block text-sm">
        <span className="text-slate-600 text-xs">Boat *</span>
        <select
          name="boat_id"
          required
          value={boatId}
          onChange={(e) => setBoatId(e.target.value)}
          className="ix-input mt-1"
        >
          {boats.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-slate-600 text-xs">Category *</span>
        <select
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="ix-input mt-1"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-slate-600 text-xs">Date *</span>
        <input name="expense_date" type="date" required defaultValue={todayCairo} className="ix-input mt-1" />
      </label>

      {showTripPicker && (
        <label className="block text-sm">
          <span className="text-slate-600 text-xs">Trip *</span>
          <select name="reservation_id" required className="ix-input mt-1" defaultValue="">
            <option value="" disabled>
              Select a trip…
            </option>
            {boatReservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.booking_date}
              </option>
            ))}
          </select>
        </label>
      )}

      {showSkipperPicker && (
        <label className="block text-sm">
          <span className="text-slate-600 text-xs">Skipper *</span>
          <select name="skipper_id" required className="ix-input mt-1" defaultValue="">
            <option value="" disabled>
              Select a skipper…
            </option>
            {boatSkippers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {showFuelInputs && (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Liters *</span>
            <input
              name="fuel_liters"
              type="number"
              step="0.01"
              min="0"
              required
              value={fuelLiters}
              onChange={(e) => setFuelLiters(e.target.value)}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Price/liter *</span>
            <input
              name="fuel_price_per_liter"
              type="number"
              step="0.01"
              min="0"
              required
              value={fuelPrice}
              onChange={(e) => setFuelPrice(e.target.value)}
              className="ix-input mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600 text-xs">Tips</span>
            <input
              name="fuel_tips_egp"
              type="number"
              step="0.01"
              min="0"
              value={fuelTips}
              onChange={(e) => setFuelTips(e.target.value)}
              className="ix-input mt-1"
            />
          </label>
          <div className="col-span-3 text-xs text-slate-500">
            Subtotal: EGP {fuelSubtotal.toFixed(2)} ·{' '}
            <strong>Total: EGP {fuelTotal.toFixed(2)}</strong>
          </div>
        </div>
      )}

      {showVendor && (
        <label className="block text-sm">
          <span className="text-slate-600 text-xs">Vendor</span>
          <input
            name="vendor_name"
            defaultValue={settings?.preferred_marina_vendor ?? ''}
            className="ix-input mt-1"
          />
        </label>
      )}

      {showAmount && (
        <label className="block text-sm">
          <span className="text-slate-600 text-xs">Amount (EGP) *</span>
          <input
            name="amount_egp"
            type="number"
            min="0"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="ix-input mt-1"
          />
        </label>
      )}
      {!showAmount && <input type="hidden" name="amount_egp" value={computedAmount} />}

      <label className="block text-sm">
        <span className="text-slate-600 text-xs">
          Description / notes{requireDescription && ' *'}
        </span>
        <textarea
          name="description"
          rows={2}
          required={requireDescription}
          className="ix-input mt-1"
        />
      </label>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="pay_now"
            checked={payNow}
            onChange={(e) => setPayNow(e.target.checked)}
          />
          <span>
            <strong>Pay now</strong> (creates expense + full payment in one step)
          </span>
        </label>
        {payNow ? (
          <label className="block text-sm pl-6">
            <span className="text-slate-600 text-xs">Method</span>
            <select name="pay_now_method" className="ix-input mt-1" defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="instapay">Instapay</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </label>
        ) : (
          <p className="text-xs text-slate-500 pl-6">
            Will create as <strong>Open</strong> bill — record payment(s) later.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <button type="submit" className="ix-btn-primary">
          Save
        </button>
      </div>
    </form>
  );
}
