// Vitest shim for the 'server-only' Next.js guard.
// The real package throws at import time in non-RSC environments;
// this empty export lets unit tests import server-only modules safely.
export {};
