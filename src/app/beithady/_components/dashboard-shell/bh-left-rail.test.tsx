// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { BHLeftRail } from './bh-left-rail';

afterEach(cleanup);

describe('BHLeftRail', () => {
  test('renders supplied section titles and children', () => {
    const { getByText } = render(
      <BHLeftRail
        sections={[
          { title: 'Period', children: <span>period-content</span> },
          { title: 'Building', children: <span>building-content</span> },
        ]}
      />,
    );
    expect(getByText('Period')).toBeTruthy();
    expect(getByText('period-content')).toBeTruthy();
    expect(getByText('Building')).toBeTruthy();
    expect(getByText('building-content')).toBeTruthy();
  });

  test('renders collapsed icons (not sections) when collapsed=true', () => {
    const { queryByText, getByTitle } = render(
      <BHLeftRail
        sections={[{ title: 'Period', children: <span>period-content</span> }]}
        collapsedIcons={[{ emoji: '📅', title: 'Period' }]}
        collapsed
      />,
    );
    // Sections hidden:
    expect(queryByText('period-content')).toBeNull();
    // Icon shown:
    expect(getByTitle('Period').textContent).toBe('📅');
  });

  test('pin toggle invokes onTogglePin', () => {
    const onTogglePin = vi.fn();
    const { getByRole } = render(
      <BHLeftRail
        sections={[{ title: 'Period', children: <span>x</span> }]}
        onTogglePin={onTogglePin}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Pin rail/i }));
    expect(onTogglePin).toHaveBeenCalledOnce();
  });
});
