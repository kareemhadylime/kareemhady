'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type BHUrlStateOpts<T> = {
  defaults: T;
  parse: (search: URLSearchParams) => T;
  serialize: (state: T) => URLSearchParams;
  basePath: string;
};

// Pure URL builder, extracted so the merge + serialize logic can be unit-tested
// without spinning up a Next router. The hook is the consumer-facing wrapper.
export function buildBHUrl<T>(args: {
  current: T;
  patch: Partial<T>;
  serialize: (state: T) => URLSearchParams;
  basePath: string;
}): string {
  const merged = { ...args.current, ...args.patch };
  const qs = args.serialize(merged).toString();
  return qs ? `${args.basePath}?${qs}` : args.basePath;
}

// Typed URL-state hook for BH data dashboards. Consumer declares the filter
// shape T and a (parse, serialize) pair; the hook handles reading from the
// URL, writing back via `router.push(url, { scroll: false })`, and exposing
// a typed `update(patch)` callback.
//
// Contract: `parse` MUST be total — return defaults for any unknown values,
// never throw. The page error boundary will not catch parse errors.
export function useBHUrlState<T>(opts: BHUrlStateOpts<T>): {
  state: T;
  update: (patch: Partial<T>) => void;
} {
  const router = useRouter();
  const search = useSearchParams();

  const state = useMemo(() => opts.parse(search), [search, opts.parse]);

  const update = useCallback((patch: Partial<T>) => {
    const url = buildBHUrl({
      current: state,
      patch,
      serialize: opts.serialize,
      basePath: opts.basePath,
    });
    router.push(url, { scroll: false });
  }, [router, state, opts.serialize, opts.basePath]);

  return { state, update };
}
