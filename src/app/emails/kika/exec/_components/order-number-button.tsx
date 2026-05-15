'use client';

import { useState } from 'react';
import { OrderDetailModal } from './order-detail-modal';

type Props = {
  orderId: number;
  orderName: string;
  className?: string;
};

export function OrderNumberButton({ orderId, orderName, className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'font-medium text-indigo-600 hover:text-indigo-700 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500/40 rounded-sm'
        }
      >
        {orderName}
      </button>
      <OrderDetailModal
        open={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
        orderName={orderName}
      />
    </>
  );
}
