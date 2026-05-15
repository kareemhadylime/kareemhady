'use client';
import { useEffect, useState } from 'react';

// Rail column widths in pixels — load-bearing constants shared with BHLeftRail
// which renders a 44px icon-strip when collapsed and a ~200px expanded panel.
const RAIL_COLLAPSED_W = 44;
const RAIL_EXPANDED_W = 200;

type Props = {
  titleBar: React.ReactNode;
  rail: React.ReactNode;
  mobileFilterSheet?: React.ReactNode;
  drawer?: React.ReactNode;
  children: React.ReactNode;
  // Rail collapse state — consumer-owned so the same collapsed/pinned state can
  // flow into the rail content (e.g. <BHLeftRail collapsed={...}>) for the pin
  // toggle and collapsed-icon strip to render correctly.
  railCollapsed?: boolean;
  onRailEnter?: () => void;
  onRailLeave?: () => void;
};

// Layout-only wrapper for BH data dashboards. Title bar full-width, rail
// in a left column, children in a right column. Switches to mobile layout
// (rail hidden, mobileFilterSheet handles filters) under (max-width: 767px).
// Drawer is rendered as a sibling so it can overlay everything.
//
// Rail-collapse state is consumer-owned (see useRailCollapse) so the same
// collapsed/pinned state can flow into the rail content for the pin toggle.
export function BHDashboardShell({
  titleBar,
  rail,
  mobileFilterSheet,
  drawer,
  children,
  railCollapsed = false,
  onRailEnter,
  onRailLeave,
}: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener('change', updateMobile);
    return () => mq.removeEventListener('change', updateMobile);
  }, []);

  const railColWidth = isMobile ? 0 : (railCollapsed ? RAIL_COLLAPSED_W : RAIL_EXPANDED_W);

  return (
    <>
      {titleBar}
      <div
        className="grid mt-6 transition-[grid-template-columns] duration-[250ms] ease motion-reduce:transition-none"
        style={{ gridTemplateColumns: `${railColWidth}px 1fr` }}
        onMouseEnter={isMobile ? undefined : onRailEnter}
        onMouseLeave={isMobile ? undefined : onRailLeave}
      >
        <div className={isMobile ? 'hidden' : ''}>{rail}</div>
        <main className="grid grid-cols-12 gap-3 sm:gap-4">{children}</main>
      </div>
      {drawer}
      {mobileFilterSheet}
    </>
  );
}
