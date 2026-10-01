import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';

/**
 * Renders the real router tree at a URL. No provider wrappers are needed -
 * state lives in module-level Zustand stores, which `resetTestState()` clears
 * between tests.
 */
export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
