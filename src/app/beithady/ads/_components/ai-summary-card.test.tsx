/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiSummaryCard } from './ai-summary-card';

describe('AiSummaryCard', () => {
  it('renders button when no summary yet', () => {
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={null} usedToday={3} />);
    expect(screen.getByRole('button', { name: /Generate/i })).toBeTruthy();
    expect(screen.getByText(/daily cap 3\/20/i)).toBeTruthy();
  });

  it('renders summary paragraphs after generation', () => {
    const summary = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={summary} usedToday={4} />);
    expect(screen.getByText(/Paragraph one/)).toBeTruthy();
    expect(screen.getByText(/Paragraph two/)).toBeTruthy();
    expect(screen.getByText(/Paragraph three/)).toBeTruthy();
  });

  it('disables button when daily cap reached', () => {
    render(<AiSummaryCard range={{ from: '2026-05-09', to: '2026-05-16' }} summary={null} usedToday={20} />);
    const btn = screen.getByRole('button', { name: /cap reached/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
