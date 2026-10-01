import { useEffect, useRef } from 'react';
import { ALL_CATEGORIES, type MenuCategory } from '@/hooks/useMenu';
interface CategoryPillsProps {
  categories: MenuCategory[];
  active: string;
  onChange: (key: string) => void;
}

/** Horizontal scroll container, sticky under the header. */
export const MENU_PANEL_ID = 'menu-list-panel';

/**
 * Horizontally scrollable category rail.
 *
 * Built as a real tablist: one of N, controlling the list below, with roving
 * tabindex and arrow-key navigation. A rail of unlabelled buttons would be
 * invisible to a screen-reader user about to browse the menu.
 *
 * Pinned to `top` of the header so it stays reachable while the list scrolls.
 */
export function CategoryPills({ categories, active, onChange }: CategoryPillsProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  const tabs = [{ key: ALL_CATEGORIES, label: 'All', count: 0 }, ...categories];
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );

  // Keep the selected pill on screen after a tap or an automatic fallback.
  useEffect(() => {
    const button = buttonRefs.current.get(active);
    button?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? 'reset' : event.key === 'End' ? 'end' : 0;

    if (step === 0) return;
    event.preventDefault();

    const last = tabs.length - 1;
    const nextIndex =
      step === 'reset' ? 0 : step === 'end' ? last : (activeIndex + step + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;

    onChange(next.key);
    buttonRefs.current.get(next.key)?.focus();
  }

  return (
    <div className="sticky top-[calc(var(--header-h)+var(--safe-top))] z-20 border-b border-white/5 bg-canvas/90 backdrop-blur-md">
      <div
        role="tablist"
        aria-label="Menu categories"
        aria-controls={MENU_PANEL_ID}
        onKeyDown={onKeyDown}
        className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(node) => {
                if (node) buttonRefs.current.set(tab.key, node);
                else buttonRefs.current.delete(tab.key);
              }}
              type="button"
              role="tab"
              id={`category-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={MENU_PANEL_ID}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={[
                'h-11 shrink-0 whitespace-nowrap rounded-2xl px-4 text-sm font-semibold',
                'transition-colors duration-150 ease-swift',
                isActive
                  ? 'bg-crimson text-ink shadow-cta'
                  : 'border border-white/5 bg-surface text-ink-muted active:bg-surface-raised',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
