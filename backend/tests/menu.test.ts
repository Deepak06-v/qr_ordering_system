import { MenuItem } from '../src/models/MenuItem';
import { Order, hashVerificationPin, verifyVerificationPin } from '../src/models/Order';
import { api, createTheater } from './helpers';

describe('Menu API', () => {
  let theaterId: string;

  beforeEach(async () => {
    theaterId = (await createTheater()).id;
  });

  describe('POST /api/menu', () => {
    it('creates a menu item with an integer paise price', async () => {
      const response = await api().post('/api/menu').send({
        theaterId,
        name: 'Classic Popcorn',
        category: 'popcorn',
        price: 18000,
      });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        name: 'Classic Popcorn',
        category: 'POPCORN',
        price: 18000,
        priceRupees: 180,
        isAvailable: true,
        displayOrder: 0,
      });
      expect(response.body.data.id).toMatch(/^[a-f0-9]{24}$/);
    });

    it('rejects a float price (money is integer paise only)', async () => {
      const response = await api().post('/api/menu').send({
        theaterId,
        name: 'Coke',
        category: 'DRINKS',
        price: 80.5,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a negative price and a missing price', async () => {
      const negative = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Free Item', category: 'OTHER', price: -1 });
      expect(negative.status).toBe(400);

      const missing = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'No Price', category: 'OTHER' });
      expect(missing.status).toBe(400);
    });

    it('rejects a price above the ceiling', async () => {
      const response = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Gold Lobster', category: 'OTHER', price: 999_999_999 });

      expect(response.status).toBe(400);
    });

    it('rejects a missing name, category and a bad theaterId', async () => {
      const noName = await api()
        .post('/api/menu')
        .send({ theaterId, category: 'OTHER', price: 100 });
      expect(noName.status).toBe(400);

      const noCategory = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Mystery', price: 100 });
      expect(noCategory.status).toBe(400);

      const badTheater = await api()
        .post('/api/menu')
        .send({ theaterId: 'nope', name: 'Mystery', category: 'OTHER', price: 100 });
      expect(badTheater.status).toBe(400);
    });

    it('rejects an invalid imageUrl', async () => {
      const response = await api().post('/api/menu').send({
        theaterId,
        name: 'Popcorn',
        category: 'POPCORN',
        price: 100,
        imageUrl: 'not-a-url',
      });

      expect(response.status).toBe(400);
    });

    it('rejects a duplicate item name within the same theater (409)', async () => {
      await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Coke', category: 'DRINKS', price: 8000 });

      const duplicate = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'coke', category: 'DRINKS', price: 9000 });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DUPLICATE_MENU_ITEM');
    });

    it('returns 404 for an unknown theater', async () => {
      const response = await api().post('/api/menu').send({
        theaterId: '64b7f9c2e13f2a1b2c3d4e5f',
        name: 'Coke',
        category: 'DRINKS',
        price: 8000,
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('THEATER_NOT_FOUND');
    });
  });

  describe('GET /api/menu/:theaterId', () => {
    beforeEach(async () => {
      await api().post('/api/menu').send({
        theaterId,
        name: 'Classic Popcorn',
        category: 'POPCORN',
        price: 18000,
        displayOrder: 1,
      });
      await api().post('/api/menu').send({
        theaterId,
        name: 'Large Popcorn',
        category: 'POPCORN',
        price: 25000,
        displayOrder: 2,
      });
      await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Coke', category: 'DRINKS', price: 8000, displayOrder: 3 });
    });

    it('returns the menu for a theater, sorted by category then display order', async () => {
      const response = await api().get(`/api/menu/${theaterId}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data.map((item: { name: string }) => item.name)).toEqual([
        'Coke',
        'Classic Popcorn',
        'Large Popcorn',
      ]);
    });

    it('hides unavailable items by default', async () => {
      const listed = await api().get(`/api/menu/${theaterId}`).expect(200);
      const target = listed.body.data[0] as { id: string };

      await api().patch(`/api/menu/items/${target.id}`).send({ isAvailable: false });

      const customer = await api().get(`/api/menu/${theaterId}`);
      expect(customer.body.data).toHaveLength(2);
      expect(
        customer.body.data.find((item: { id: string }) => item.id === target.id),
      ).toBeUndefined();

      const admin = await api().get(`/api/menu/${theaterId}`).query({ includeUnavailable: 'true' });
      expect(admin.body.data).toHaveLength(3);
    });

    it('filters by category', async () => {
      const response = await api().get(`/api/menu/${theaterId}`).query({ category: 'POPCORN' });

      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every((item: { category: string }) => item.category === 'POPCORN'),
      ).toBe(true);
    });

    it('does not leak another theater menu', async () => {
      const other = await createTheater({ name: 'Other Cinema' });

      const response = await api().get(`/api/menu/${other.id}`);

      expect(response.body.data).toEqual([]);
    });

    it('returns 400 for a malformed theaterId', async () => {
      const response = await api().get('/api/menu/not-an-id');
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/menu/items/:id', () => {
    it('updates a price and flags', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Coke', category: 'DRINKS', price: 8000 });

      const response = await api()
        .patch(`/api/menu/items/${created.body.data.id}`)
        .send({ price: 9500, isAvailable: false, description: 'Chilled' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        price: 9500,
        priceRupees: 95,
        isAvailable: false,
        description: 'Chilled',
      });
    });

    it('rejects a float price on update', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Coke', category: 'DRINKS', price: 8000 });

      const response = await api()
        .patch(`/api/menu/items/${created.body.data.id}`)
        .send({ price: 80.5 });

      expect(response.status).toBe(400);
    });

    it('rejects an empty patch and unknown fields', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Coke', category: 'DRINKS', price: 8000 });

      expect((await api().patch(`/api/menu/items/${created.body.data.id}`).send({})).status).toBe(
        400,
      );
      expect(
        (await api().patch(`/api/menu/items/${created.body.data.id}`).send({ hacked: true }))
          .status,
      ).toBe(400);
    });

    it('returns 404 MENU_ITEM_NOT_FOUND for an unknown id', async () => {
      const response = await api()
        .patch('/api/menu/items/64b7f9c2e13f2a1b2c3d4e5f')
        .send({ price: 100 });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('MENU_ITEM_NOT_FOUND');
    });
  });

  describe('GET /api/menu/items/:id', () => {
    it('returns a single item', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Nachos', category: 'SNACKS', price: 20000 });

      const response = await api().get(`/api/menu/items/${created.body.data.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ name: 'Nachos', price: 20000 });
    });

    it('returns 404 for an unknown id', async () => {
      const response = await api().get('/api/menu/items/64b7f9c2e13f2a1b2c3d4e5f');
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/menu/items/:id', () => {
    it('deletes an item', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Water', category: 'DRINKS', price: 2000 });

      const response = await api().delete(`/api/menu/items/${created.body.data.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ id: created.body.data.id, deleted: true });
      expect(await MenuItem.countDocuments({ theaterId })).toBe(0);
    });

    it('returns 404 when deleting twice', async () => {
      const created = await api()
        .post('/api/menu')
        .send({ theaterId, name: 'Water', category: 'DRINKS', price: 2000 });

      await api().delete(`/api/menu/items/${created.body.data.id}`).expect(200);
      const second = await api().delete(`/api/menu/items/${created.body.data.id}`);

      expect(second.status).toBe(404);
    });
  });
});

describe('Order model invariants', () => {
  it('stores money as integer paise and never stores a plaintext PIN', async () => {
    const theater = await createTheater();
    const order = await Order.create({
      orderNumber: 'FM-1001',
      hash: 'a8f7K2mQx91PvL4sAbCdEfGh',
      theaterId: theater.id,
      seatDetails: { screenNumber: 4, seatNumber: 'G3' },
      items: [{ itemId: new MenuItem()._id, name: 'Classic Popcorn', quantity: 2, price: 18000 }],
      totalAmount: 36000,
      verificationPinHash: hashVerificationPin('8492'),
      status: 'PAID',
      paymentStatus: 'COMPLETED',
    });

    expect(order.totalAmount).toBe(36000);
    expect(Number.isInteger(order.totalAmount)).toBe(true);

    const stored = await Order.findById(order._id).select('+verificationPinHash').lean();
    const record = JSON.stringify(stored);
    expect(record).not.toContain('"8492"');
    expect(verifyVerificationPin('8492', stored?.verificationPinHash ?? undefined)).toBe(true);
  });

  it('rejects an out-of-enum status', async () => {
    const theater = await createTheater();

    await expect(
      Order.create({
        orderNumber: 'FM-1003',
        hash: 'a8f7K2mQx91PvL4sAbCdEfGh',
        theaterId: theater.id,
        seatDetails: { screenNumber: 4, seatNumber: 'G3' },
        items: [{ itemId: new MenuItem()._id, name: 'Coke', quantity: 1, price: 8000 }],
        totalAmount: 8000,
        status: 'SHIPPED',
      }),
    ).rejects.toThrow();
  });

  it('rejects a fractional price inside an order line', async () => {
    const theater = await createTheater();

    await expect(
      Order.create({
        orderNumber: 'FM-1003',
        hash: 'a8f7K2mQx91PvL4sAbCdEfGh',
        theaterId: theater.id,
        seatDetails: { screenNumber: 4, seatNumber: 'G3' },
        items: [{ itemId: new MenuItem()._id, name: 'Coke', quantity: 1, price: 80.5 }],
        totalAmount: 8050,
      }),
    ).rejects.toThrow();
  });
});
