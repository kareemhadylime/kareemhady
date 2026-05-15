// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { BHTitleBar } from './bh-title-bar';

afterEach(cleanup);

describe('BHTitleBar', () => {
  test('renders title, eyebrow, and subtitle', () => {
    const { getByText } = render(
      <BHTitleBar
        eyebrow="Performance Dashboard"
        title="Fri, 15 May 2026 · Snapshot"
        subtitle="Data as of 09:00 Cairo"
      />,
    );
    expect(getByText('Performance Dashboard')).toBeTruthy();
    expect(getByText('Fri, 15 May 2026 · Snapshot')).toBeTruthy();
    expect(getByText('Data as of 09:00 Cairo')).toBeTruthy();
  });

  test('renders chips with their labels', () => {
    const { getByText } = render(
      <BHTitleBar
        title="x"
        chips={[
          { icon: Calendar, label: 'Cairo 09:00' },
          { icon: Calendar, label: 'BH-26' },
        ]}
      />,
    );
    expect(getByText('Cairo 09:00')).toBeTruthy();
    expect(getByText('BH-26')).toBeTruthy();
  });

  test('renders actions slot verbatim', () => {
    const { getByTestId } = render(
      <BHTitleBar
        title="x"
        actions={<button data-testid="custom-btn">Export</button>}
      />,
    );
    expect(getByTestId('custom-btn').textContent).toBe('Export');
  });

  test('mobile filter button calls onMobileFilterClick', () => {
    const onMobileFilterClick = vi.fn();
    const { getByRole } = render(
      <BHTitleBar title="x" onMobileFilterClick={onMobileFilterClick} />,
    );
    fireEvent.click(getByRole('button', { name: /Open filters/i }));
    expect(onMobileFilterClick).toHaveBeenCalledOnce();
  });

  test('mobile filter button is hidden when onMobileFilterClick is not provided', () => {
    const { queryByRole } = render(<BHTitleBar title="x" />);
    expect(queryByRole('button', { name: /Open filters/i })).toBeNull();
  });
});
