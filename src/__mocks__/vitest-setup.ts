import '@testing-library/react/pure';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Belt-and-suspenders cleanup: @testing-library/react installs its own
// afterEach(cleanup) hook automatically when vitest is detected, so this is
// technically redundant. We make it explicit here so per-file afterEach(cleanup)
// calls are clearly unnecessary — add new jsdom component tests without one
// and rely on this global instead (project convention per Phase A code-review).
afterEach(cleanup);
