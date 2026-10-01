import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/api/client';
import { listMenu } from '@/api/endpoints';
import type { MenuItem } from '@/api/types';
import { humanizeCategory } from '@/lib/format';

export interface MenuCategory {
  /** Backend category key, UPPER_CASE. */
  key: string;
  label: string;
  count: number;
}

export type MenuState =
  | { status: 'loading' }
  | { status: 'error'; retryable: boolean }
  | { status: 'ready'; items: MenuItem[]; categories: MenuCategory[] };

/** Sentinel for "everything", so no single category pill is meaningless. */
export const ALL_CATEGORIES = 'ALL';

/**
 * Loads the theater menu and derives its category rail in one pass.
 *
 * Categories are ordered by the menu's own sort (`category` ascending), so the
 * rail always matches what the customer would see scrolling the list.
 */
export function useMenu(theaterId: string): MenuState & {
  retry: () => void;
} {
  const [state, setState] = useState<MenuState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    listMenu(theaterId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'ready',
          items,
          categories: deriveCategories(items),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const retryable = error instanceof ApiError ? error.isRetryable : true;
        setState({ status: 'error', retryable });
      });

    return () => controller.abort();
  }, [theaterId, attempt]);

  return { ...state, retry };
}

function deriveCategories(items: MenuItem[]): MenuCategory[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: humanizeCategory(key), count }));
}

/** Filters the visible list for a selected category pill. */
export function useCategoryFilter(items: MenuItem[]): {
  active: string;
  setActive: (key: string) => void;
  visible: MenuItem[];
} {
  const [active, setActive] = useState<string>(ALL_CATEGORIES);

  // A theater whose menu changes underneath a selected pill must not leave the
  // customer staring at an empty list.
  const available = useMemo(() => new Set(items.map((item) => item.category)), [items]);
  useEffect(() => {
    if (active !== ALL_CATEGORIES && !available.has(active)) setActive(ALL_CATEGORIES);
  }, [active, available]);

  const visible = useMemo(
    () => (active === ALL_CATEGORIES ? items : items.filter((item) => item.category === active)),
    [items, active],
  );

  return { active, setActive, visible };
}
