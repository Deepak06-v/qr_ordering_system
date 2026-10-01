import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderAt';
import { INACTIVE_HASH, OTHER_HASH, SHORT_HASH, VALID_HASH } from '@/test/fixtures';

describe('QR resolution', () => {
  it('resolves a valid sticker and shows the seat as confirmation only', async () => {
    renderAt(`/${VALID_HASH}`);

    // The seat pill is the only place a seat appears.
    const pill = await screen.findByText(`G3 • Screen 4`);
    expect(pill).toBeInTheDocument();

    // There is no field to type a seat into, anywhere on the page.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/select your seat/i)).not.toBeInTheDocument();
  });

  it('rejects a malformed hash without asking the server', async () => {
    renderAt(`/${SHORT_HASH}`);

    expect(
      await screen.findByRole('heading', { name: 'QR code not recognised' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/invalid/i)).toBeInTheDocument();
  });

  it('shows "unavailable" for a retired sticker', async () => {
    renderAt(`/${INACTIVE_HASH}`);

    expect(
      await screen.findByRole('heading', { name: 'QR code unavailable' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument();
  });

  it('shows "not recognised" for an unknown sticker', async () => {
    renderAt(`/${OTHER_HASH}`);

    expect(
      await screen.findByRole('heading', { name: 'QR code not recognised' }),
    ).toBeInTheDocument();
  });

  it('never renders a login, signup or account affordance', async () => {
    renderAt(`/${VALID_HASH}`);
    await screen.findByText(`G3 • Screen 4`);

    for (const label of [/log ?in/i, /sign ?up/i, /register/i, /my account/i, /password/i]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });
});

describe('menu', () => {
  it('lists the theater menu', async () => {
    renderAt(`/${VALID_HASH}`);

    const list = await screen.findByRole('tabpanel');
    const names = within(list).getAllByRole('heading', { level: 3 }).map((n) => n.textContent);

    expect(names).toEqual(expect.arrayContaining(['Large Popcorn', 'Nachos', 'Coke']));
  });

  it('filters to a single category when a pill is tapped', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await user.click(screen.getByRole('tab', { name: 'Drinks' }));

    await waitFor(() => {
      const list = screen.getByRole('tabpanel');
      const names = within(list).getAllByRole('heading', { level: 3 }).map((n) => n.textContent);
      expect(names).toEqual(['Coke', 'Pepsi']);
    });

    expect(screen.getByRole('tab', { name: 'Drinks' })).toHaveAttribute('aria-selected', 'true');
  });

  it('returns to the full menu via the All pill', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await user.click(screen.getByRole('tab', { name: 'Snacks' }));
    await user.click(screen.getByRole('tab', { name: 'All' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Nachos' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not render the category rail before the menu arrives', () => {
    renderAt(`/${VALID_HASH}`);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
