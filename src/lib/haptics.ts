'use client';

// Subtle haptic feedback for state transitions. Guards on
// navigator.vibrate availability + user's prefers-reduced-motion
// preference. No-op on unsupported devices/desktops.

function canVibrate(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.vibrate !== 'function') return false;
  // Respect reduced-motion preference — some users disable haptics this way.
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  }
  return true;
}

export function hapticTap(): void {
  if (canVibrate()) navigator.vibrate(15);
}

export function hapticSuccess(): void {
  if (canVibrate()) navigator.vibrate([20, 30, 40]);
}

export function hapticError(): void {
  if (canVibrate()) navigator.vibrate([60, 40, 60]);
}

export function hapticConfirm(): void {
  if (canVibrate()) navigator.vibrate(35);
}
