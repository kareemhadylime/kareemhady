// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BHCustomizeDrawer } from './bh-customize-drawer';

describe('BHCustomizeDrawer', () => {
  test('renders nothing when open=false', () => {
    const { container } = render(
      <BHCustomizeDrawer open={false} onClose={() => {}} title="Customize">
        <div data-testid="content">panels</div>
      </BHCustomizeDrawer>,
    );
    expect(container.querySelector('[data-testid="content"]')).toBeNull();
  });

  test('renders children when open=true', () => {
    const { getByTestId } = render(
      <BHCustomizeDrawer open onClose={() => {}} title="Customize">
        <div data-testid="content">panels</div>
      </BHCustomizeDrawer>,
    );
    expect(getByTestId('content').textContent).toBe('panels');
  });

  test('clicking close (×) button fires onClose', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <BHCustomizeDrawer open onClose={onClose} title="Customize">
        <div>x</div>
      </BHCustomizeDrawer>,
    );
    fireEvent.click(getByLabelText('Close customize drawer'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
