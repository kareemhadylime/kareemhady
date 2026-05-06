'use client';
import React, { useEffect, useState } from 'react';
import {
  DndContext, DragEndEvent, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { OrderCard } from './order-card';
import { OrderFilters } from './order-filters';

const COLUMNS: Array<{ status: 'submitted' | 'preparing' | 'ready' | 'delivered'; label: string }> = [
  { status: 'submitted', label: 'Submitted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready',     label: 'Ready' },
  { status: 'delivered', label: 'Delivered' },
];

interface OrderRow {
  id: string;
  order_number: number;
  building_code: string;
  unit_code: string;
  guest_name: string | null;
  status: string;
  total_usd: number | string;
  submitted_at: string;
  fnb_order_items?: Array<unknown>;
}

export function OrderBoard({
  buildings,
}: { buildings: Array<{ building_code: string; enabled: boolean }> }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filters, setFilters] = useState<{
    buildings: string[];
    date_from: string;
    date_to: string;
  }>({
    buildings: buildings.filter(b => b.enabled).map(b => b.building_code),
    date_from: new Date(Date.now() - 24 * 3600_000).toISOString(),
    date_to: new Date(Date.now() + 24 * 3600_000).toISOString(),
  });

  async function reload() {
    const params = new URLSearchParams();
    filters.buildings.forEach(b => params.append('building_code', b));
    COLUMNS.forEach(c => params.append('status', c.status));
    params.set('date_from', filters.date_from);
    params.set('date_to', filters.date_to);
    const r = await fetch(`/api/beithady/fnb/orders?${params}`);
    if (r.ok) setOrders((await r.json()).orders);
  }

  useEffect(() => {
    reload();
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function move(orderId: string, to: string) {
    const res = await fetch(`/api/beithady/fnb/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_status: to }),
    });
    if (res.ok) reload();
    else alert((await res.json().catch(() => ({}))).error || 'Update failed');
  }

  function handleDragEnd(e: DragEndEvent) {
    const orderId = e.active.id as string;
    const target = e.over?.id as string | undefined;
    if (!target) return;
    move(orderId, target);
  }

  return (
    <div>
      <OrderFilters filters={filters} setFilters={setFilters} buildings={buildings} />
      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLUMNS.map(col => (
            <DroppableColumn key={col.status} status={col.status} label={col.label}>
              {orders.filter(o => o.status === col.status).map(o => (
                <DraggableCard key={o.id} order={o} />
              ))}
            </DroppableColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function DroppableColumn({
  status, label, children,
}: { status: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`ix-card p-3 min-h-[60vh] ${isOver ? 'ring-2 ring-rose-300' : ''}`}
    >
      <h3 className="text-xs uppercase tracking-wide font-semibold mb-3">
        {label} ({React.Children.count(children)})
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DraggableCard({ order }: { order: OrderRow }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: order.id });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        cursor: 'grab',
      }}
    >
      <OrderCard order={order} />
    </div>
  );
}
