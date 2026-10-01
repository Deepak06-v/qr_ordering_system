import { describe, expect, it } from 'vitest';
import { screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from '@/test/renderAt';
import { VALID_HASH } from '@/test/fixtures';
import { useCartStore } from '@/store/cartStore';

/** The floating bar is a single button; its label carries count and total. */
const cartButton = () => screen.queryByRole('button', { name: /view order/i });

async function addPopcornTwice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Add Large Popcorn to order' }));
  await user.click(screen.getByRole('button', { name: 'Increase Large Popcorn' }));
}

describe('cart', () => {
  it('stays hidden while the cart is empty', async () => {
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');
    expect(cartButton()).not.toBeInTheDocument();
  });

  it('appears on the first add with the count and total', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await addPopcornTwice(user);

    const bar = await screen.findByRole('button', { name: /view order/i });
    expect(bar).toHaveAccessibleName(expect.stringContaining('2 items') as unknown as string);
    expect(bar).toHaveTextContent('₹700');
  });

  it('replaces the + with a stepper and never shows both', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await addPopcornTwice(user);

    // The add button is gone, replaced in place by the stepper.
    expect(
      screen.queryByRole('button', { name: 'Add Large Popcorn to order' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease Large Popcorn' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Quantity for Large Popcorn' })).toBeInTheDocument();
  });

  it('updates the total as quantity changes', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await addPopcornTwice(user);
    expect(screen.getByRole('button', { name: /view order/i })).toHaveTextContent('₹700');

    await user.click(screen.getByRole('button', { name: 'Decrease Large Popcorn' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /view order/i })).toHaveTextContent('₹350'),
    );
  });

  it('removes the item when stepping down from 1, and hides the bar', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await user.click(await screen.findByRole('button', { name: 'Add Large Popcorn to order' }));
    const bar = await screen.findByRole('button', { name: /view order/i });

    // At quantity 1 the minus button's job is to remove the line.
    await user.click(screen.getByRole('button', { name: 'Remove Large Popcorn from order' }));

    await waitForElementToBeRemoved(bar);
    expect(cartButton()).not.toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removes a line from the cart sheet', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await user.click(await screen.findByRole('button', { name: 'Add Nachos to order' }));
    await user.click(screen.getByRole('button', { name: /view order/i }));

    const sheet = await screen.findByRole('dialog', { name: 'Your order' });
    await user.click(within(sheet).getByRole('button', { name: 'Remove Nachos' }));

    // Emptying the cart closes the sheet rather than showing an empty basket.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('cart sheet', () => {
  it('opens as a modal bottom sheet with the ordered items', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await addPopcornTwice(user);
    await user.click(screen.getByRole('button', { name: /view order/i }));

    const sheet = await screen.findByRole('dialog', { name: 'Your order' });
    expect(within(sheet).getByText('Large Popcorn')).toBeInTheDocument();
    expect(within(sheet).getByText(/₹350 each/)).toBeInTheDocument();
    expect(within(sheet).getAllByRole('button', { name: /Popcorn/ })).toHaveLength(2);
    // Exactly one way to dismiss, so a screen reader never meets two
    // identically labelled controls.
    expect(within(sheet).getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  });

  it('is dismissable and returns focus to the bar', async () => {
    const user = userEvent.setup();
    renderAt(`/${VALID_HASH}`);
    await screen.findByRole('tabpanel');

    await addPopcornTwice(user);
    const bar = await screen.findByRole('button', { name: /view order/i });
    await user.click(bar);

    await screen.findByRole('dialog', { name: 'Your order' });
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(bar).toHaveFocus());
  });
});
