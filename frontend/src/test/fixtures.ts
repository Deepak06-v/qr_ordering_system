import type { MenuItem, Order, PaymentSession, ResolvedSeat, VerifyPaymentResponse } from '@/api/types';

export const THEATER_ID = '66a1b2c3d4e5f60718293a4b';

/**
 * Real Mongo ObjectIds throughout.
 *
 * The server validates every id with `objectIdSchema`, so a fixture using `'m1'`
 * would let a test pass against a request the real API rejects with a 400.
 */
export const ITEM_POPCORN_L = '66a1b2c3d4e5f60718293b01';
export const ITEM_POPCORN_M = '66a1b2c3d4e5f60718293b02';
export const ITEM_NACHOS = '66a1b2c3d4e5f60718293b03';
export const ITEM_COKE = '66a1b2c3d4e5f60718293b04';
export const ITEM_PEPSI = '66a1b2c3d4e5f60718293b05';
export const ORDER_ID = '66a1b2c3d4e5f60718293a99';
export const PAYMENT_ID = 'pay_sim_66a1b2c3d4e5f60718293a99';

export const VALID_HASH = 'a8f7K2mQx91PvL4sAbCdEfGh';
export const OTHER_HASH = 'zZ00zz11ZZ22yy33XX44yy55';
export const INACTIVE_HASH = 'rR77rr88RR99ss00TT11tt22';
export const SHORT_HASH = 'tooshort';

export const seat: ResolvedSeat = {
  hash: VALID_HASH,
  theaterId: THEATER_ID,
  screenNumber: 4,
  seatNumber: 'G3',
  theater: {
    id: THEATER_ID,
    name: 'PVR IMAX',
    city: 'Mumbai',
    timezone: 'Asia/Kolkata',
    isActive: true,
  },
};

function item(overrides: Partial<MenuItem> & Pick<MenuItem, 'id' | 'name' | 'price'>): MenuItem {
  return {
    theaterId: THEATER_ID,
    category: 'POPCORN',
    priceRupees: overrides.price / 100,
    isAvailable: true,
    displayOrder: 0,
    imageUrl: '/images/products/large-popcorn.jpg',
    ...overrides,
  };
}

/** Prices are integer paise, exactly as the API transports them. */
export const menu: MenuItem[] = [
  item({
    id: ITEM_POPCORN_L,
    name: 'Large Popcorn',
    price: 35000,
    description: 'Freshly popped salted popcorn, perfect for movie night.',
    imageUrl: '/images/products/large-popcorn.jpg',
  }),
  item({
    id: ITEM_POPCORN_M,
    name: 'Medium Popcorn',
    price: 25000,
    displayOrder: 1,
    description: 'Classic buttery popcorn in a medium size.',
    imageUrl: '/images/products/regular-popcorn.jpg',
  }),
  item({
    id: ITEM_NACHOS,
    name: 'Nachos',
    price: 30000,
    category: 'SNACKS',
    description: 'Crispy tortilla chips with warm cheese sauce.',
    imageUrl: '/images/products/nachos.jpg',
  }),
  item({
    id: ITEM_COKE,
    name: 'Coke',
    price: 15000,
    category: 'DRINKS',
    description: 'Chilled Coca-Cola, served ice cold.',
    imageUrl: '/images/products/coke.jpg',
  }),
  item({
    id: ITEM_PEPSI,
    name: 'Pepsi',
    price: 15000,
    category: 'DRINKS',
    displayOrder: 1,
    description: 'Refreshing chilled Pepsi.',
    imageUrl: '/images/products/pepsi.jpg',
  }),
];

export const order: Order = {
  orderId: ORDER_ID,
  orderNumber: 'FM-1042',
  theaterId: THEATER_ID,
  screenNumber: 4,
  seatNumber: 'G3',
  items: [
    { itemId: ITEM_POPCORN_L, name: 'Large Popcorn', quantity: 2, price: 35000 },
    { itemId: ITEM_COKE, name: 'Coke', quantity: 1, price: 15000 },
  ],
  totalAmount: 85000,
  currency: 'INR',
  status: 'PAID',
  paymentStatus: 'COMPLETED',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:05.000Z',
  paidAt: '2026-01-01T10:00:05.000Z',
};

/** `POST /api/orders/:id/payments` - mirrors `CreatePaymentDTO`. */
export const payment: PaymentSession = {
  orderId: ORDER_ID,
  orderNumber: 'FM-1042',
  paymentId: PAYMENT_ID,
  amount: 85000,
  currency: 'INR',
  status: 'PENDING',
  provider: 'simulated',
  simulated: true,
};

/** `POST /api/orders/:id/payments/verify` - mirrors `VerifyPaymentDTO`. */
export const verified: VerifyPaymentResponse = {
  order,
  verificationPin: '8492',
  alreadyCompleted: false,
};

export const PIN = '8492';

export const VALIDATION_HASH = {
  items: menu.map((entry, index) => ({ itemId: entry.id, quantity: index + 1 })),
};