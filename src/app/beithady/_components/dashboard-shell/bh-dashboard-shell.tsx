'use client';
import { useEffect, useState } from 'react';
import { useRailCollapse } from './use-rail-collapse';

type Props = {
  titleBar: React.ReactNode;
  rail: React.ReactNode;
  mobileFilterSheet?: React.ReactNode;
  drawer?: React.ReactNode;
  children: React.ReactNode;
  // Optional override for collapse state. If omitted, internal useRailCollapse
  // governs hover-collapse + pinning behavior.
  railCollapsed?: boolean;
  railPinned?: boolean;
  onRailEnter?: () => void;
  onRailLeave?: () => void;
};

// Layout-only wrapper for BH data dashboards. Title bar full-width, rail
// in a left column, children in a right column. Switches to mobile layout
// (rail hidden, mobileFilterSheet handles filters) under (max-width: 767px).
// Drawer is rendered as a sibling so it can overlay everything.
export function BHDashboardShell({
  titleBar,
  rail,
  mobileFilterSheet,
  drawer,
  children,
  railCollapsed,
  railPinned,
  onRailEnter,
  onRailLeave,
}: Props) {
  const internal = useRailCollapse();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener('change', updateMobile);
    return () => mq.removeEventListener('change', updateMobile);
  }, []);

  // Caller controls collapse when railCollapsed is provided; otherwise the
  // internal hook governs. Same for hover handlers — caller can opt out by
  // passing onRailEnter/Leave={() => {}} or rely on the defaults.
  const collapsed = railCollapsed ?? internal.collapsed;
  const handleEnter = onRailEnter ?? internal.handleEnter;
  const handleLeave = onRailLeave ?? internal.handleLeave;

  const railColWidth = isMobile ? 0 : (collapsed ? 44 : 200);

  return (
    <>
      {titleBar}
      <div
        className="grid mt-6 transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
        style={{ gridTemplateColumns: `${railColWidth}px 1fr` }}
        onMouseEnter={isMobile ? undefined : handleEnter}
        onMouseLeave={isMobile ? undefined : handleLeave}
      >
        <div className={isMobile ? 'hidden' : ''}>{rail}</div>
        <main className="grid grid-cols-12 gap-3 sm:gap-4">{children}</main>
      </div>
      {drawer}
      {mobileFilterSheet}
    </>
  );
}
