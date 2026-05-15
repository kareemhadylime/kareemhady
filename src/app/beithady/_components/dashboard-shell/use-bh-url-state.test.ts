import { describe, it, expect } from 'vitest';
import { buildBHUrl } from './use-bh-url-state';

type DemoState = { date: string | undefined; building: string; compare: string };

const defaults: DemoState = { date: undefined, building: 'all', compare: 'yesterday' };

function serialize(state: DemoState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.date) params.set('date', state.date);
  if (state.building && state.building !== 'all') params.set('building', state.building);
  if (state.compare && state.compare !== 'yesterday') params.set('compare', state.compare);
  return params;
}

// This test exercises only the pure URL builder. The hook layer (router.push +
// scroll:false) is verified via manual smoke on the Analytics Performance page
// after Phase B migration — mocking next/navigation in vitest is heavy enough
// that the manual-smoke trade-off is intentional for this thin wrapper.
describe('buildBHUrl', () => {
  it('returns basePath alone when all values are at defaults', () => {
    const url = buildBHUrl({
      current: defaults,
      patch: {},
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example');
  });

  it('appends serialized query when at least one value diverges from defaults', () => {
    const url = buildBHUrl({
      current: defaults,
      patch: { building: 'BH-26' },
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?building=BH-26');
  });

  it('merges patch over current without losing existing params', () => {
    const url = buildBHUrl({
      current: { date: '2026-05-05', building: 'BH-26', compare: 'last-week' },
      patch: { building: 'BH-73' },
      serialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?date=2026-05-05&building=BH-73&compare=last-week');
  });

  it('lets serialize decide which keys go in (e.g. emit explicit "none")', () => {
    const customSerialize = (s: DemoState): URLSearchParams => {
      const p = new URLSearchParams();
      if (s.compare === 'none') p.set('compare', 'none');
      return p;
    };
    const url = buildBHUrl({
      current: defaults,
      patch: { compare: 'none' },
      serialize: customSerialize,
      basePath: '/example',
    });
    expect(url).toBe('/example?compare=none');
  });
});
