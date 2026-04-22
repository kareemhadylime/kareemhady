// Plain constants that middleware (Edge runtime) can safely import.
// The full auth module uses node:crypto which is not available at the
// edge, so anything shared with middleware lives here.

export const SESSION_COOKIE = 'lime_session';
