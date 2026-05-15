// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHMobileFilterSheet } from './bh-mobile-filter-sheet';

describe('BHMobileFilterSheet', () => {
  test('renders nothing when open=false', () => {
    const { container } = render(
      <BHMobileFilterSheet open={false} onClose={() => {}}>
        <div data-testid="content">filters</div>
      </BHMobileFilterSheet>,
    );
    expect(container.querySelector('[data-testid="content"]')).toBeNull();
  });

  test('renders children when open=true', () => {
    const { getByTestId } = render(
      <BHMobileFilterSheet open onClose={() => {}}>
        <div data-testid="content">filters</div>
      </BHMobileFilterSheet>,
    );
    expect(getByTestId('content').textContent).toBe('filters');
  });

  test('clicking the Done button fires onClose', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <BHMobileFilterSheet open onClose={onClose}>
        <div>x</div>
      </BHMobileFilterSheet>,
    );
    fireEvent.click(getByRole('button', { name: /Done/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
