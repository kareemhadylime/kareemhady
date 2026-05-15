import '@testing-library/react/pure';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Auto-cleanup: @testing-library/react's cleanup normally runs automatically
// when vitest globals are enabled. This project uses globals: false, so we
// install it here via setupFiles instead — making per-file afterEach(cleanup)
// calls redundant (project convention per Phase A code-review).
afterEach(cleanup);
