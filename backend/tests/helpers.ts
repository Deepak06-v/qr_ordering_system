import type { Application } from 'express';
import type { Response as SuperAgentResponse } from 'superagent';
import request from 'supertest';
import { createApp } from '../src/app';

export const app: Application = createApp();

export const api = (): request.Agent => request(app);

/** Creates a theater and returns its id. */
export async function createTheater(
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
  const response = await api()
    .post('/api/theaters')
    .send({ name: 'Demo Cinema', city: 'Bengaluru', ...overrides })
    .expect(201);

  return response.body.data as { id: string; name: string };
}

/** Creates a single seat QR mapping and returns the created resource. */
export async function createSeatHash(
  theaterId: string,
  seatNumber: string,
  screenNumber = 4,
): Promise<{ hash: string; url: string; seatNumber: string; screenNumber: number }> {
  const response = await api()
    .post('/api/seat-hashes')
    .send({ theaterId, screenNumber, seatNumber })
    .expect(201);

  return response.body.data as {
    hash: string;
    url: string;
    seatNumber: string;
    screenNumber: number;
  };
}

export interface SeededMenuItem {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

/** Creates a theater, a seat QR and one menu item, so an order can be placed. */
export async function seedOrderableTheater(options: {
  name?: string;
  seatNumber?: string;
  screenNumber?: number;
  itemName?: string;
  price?: number;
} = {}): Promise<{
  theaterId: string;
  hash: string;
  screenNumber: number;
  seatNumber: string;
  item: SeededMenuItem;
}> {
  const theaterId = (await createTheater({ name: options.name ?? 'Demo Cinema' })).id;
  const seat = await createSeatHash(theaterId, options.seatNumber ?? 'G3', options.screenNumber ?? 4);

  const menu = await api()
    .post('/api/menu')
    .send({
      theaterId,
      name: options.itemName ?? 'Classic Popcorn',
      category: 'popcorn',
      price: options.price ?? 18000,
    })
    .expect(201);

  return {
    theaterId,
    hash: seat.hash,
    screenNumber: seat.screenNumber,
    seatNumber: seat.seatNumber,
    item: menu.body.data as SeededMenuItem,
  };
}

export interface OrderResponse {
  orderId: string;
  orderNumber: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  items: Array<{ itemId: string; name: string; quantity: number; price: number }>;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  verificationPin?: string;
}

/** Places an order and returns the created resource. */
export async function placeOrder(
  seed: { hash: string; item: { id: string } },
  quantity = 1,
): Promise<OrderResponse> {
  const response = await api()
    .post('/api/orders')
    .send({ hash: seed.hash, items: [{ itemId: seed.item.id, quantity }] })
    .expect(201);

  return response.body.data as OrderResponse;
}

/** Opens a payment for an order. */
export async function openPayment(orderId: string): Promise<{ paymentId: string; amount: number }> {
  const response = await api().post(`/api/orders/${orderId}/payments`).expect(201);
  return response.body.data as { paymentId: string; amount: number };
}

/** Reads the first N bytes of a PNG and returns { width, height } from the IHDR chunk. */
export function readPngSize(buffer: Buffer): { width: number; height: number } {  if (buffer.length < 24) throw new Error('Not a PNG: too short');
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') throw new Error('Not a PNG: bad signature');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Supertest parser for non-JSON textual responses (SVG). */
export function textParser(
  res: SuperAgentResponse,
  callback: (err: Error | null, body: string) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
  res.on('error', (error: Error) => callback(error, ''));
}
export const PNG_SIGNATURE = '89504e470d0a1a0a';
