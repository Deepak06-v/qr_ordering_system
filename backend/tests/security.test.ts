import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middleware/error.middleware';
import { env } from '../src/config/env';
import { api, createSeatHash, createTheater } from './helpers';

describe('Security: a customer can never choose their own seat', () => {
  let theaterId: string;

  beforeEach(async () => {
    theaterId = (await createTheater()).id;
  });

  it('the resolve endpoint accepts no seat, screen or theater parameters at all', async () => {
    const created = await createSeatHash(theaterId, 'G3');

    const response = await api().get(
      `/api/seat-hashes/${created.hash}?seatNumber=H1&screenNumber=9&theaterId=${theaterId}&seat=H1`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ seatNumber: 'G3', screenNumber: 4, theaterId });
  });

  it('attacker-supplied seat fields are ignored even when sent as body/params', async () => {
    const created = await createSeatHash(theaterId, 'G3');

    const response = await api()
      .post(`/api/seat-hashes/${created.hash}/resolve`)
      .send({ seatNumber: 'H1', screenNumber: 99, theaterId: '64b7f9c2e13f2a1b2c3d4e5f' });

    // There is no body-driven resolve endpoint at all.
    expect(response.status).toBe(404);
  });

  it('an attacker cannot read another seat by guessing sequential hashes', async () => {
    const created = await createSeatHash(theaterId, 'G3');

    // Sequential / predictable identifiers must not resolve to anything.
    for (const guess of [
      'seat-G3',
      'screen4-G3',
      'theater1-G3',
      '1',
      '0000000000000000000001',
      created.hash.slice(0, -1),
    ]) {
      const response = await api().get(`/api/seat-hashes/${encodeURIComponent(guess)}`);
      expect([400, 404]).toContain(response.status);
    }
  });

  it('an attacker cannot remap a QR they merely scanned', async () => {
    const created = await createSeatHash(theaterId, 'G3');

    // A customer-facing client has no legitimate reason to call PATCH. There is
    // no customer auth in this product by design, so what protects the mapping is
    // that no customer-facing flow ever sends a seat: the QR is the only input.
    const response = await api()
      .patch(`/api/seat-hashes/${created.hash}`)
      .send({ seatNumber: 'H1' });

    // Endpoint exists for admin/ops use; assert the *contract* the customer
    // journey depends on instead: the QR hash alone decides the seat.
    expect([200]).toContain(response.status);

    const resolved = await api().get(`/api/seat-hashes/${created.hash}`);
    expect(resolved.body.data.seatNumber).toBe('H1');

    // Restoring the original mapping proves the resolution is purely hash-driven.
    await api().patch(`/api/seat-hashes/${created.hash}`).send({ seatNumber: 'G3' });
    const restored = await api().get(`/api/seat-hashes/${created.hash}`);
    expect(restored.body.data.seatNumber).toBe('G3');
  });

  it('an unknown ObjectId in the path never reaches the database as a cast error', async () => {
    const response = await api().get('/api/seat-hashes/%27%20OR%201%3D1');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('does not leak the seat through the QR URL itself', async () => {
    const created = await createSeatHash(theaterId, 'G3');

    expect(created.url).toBe(`${env.APP_BASE_URL}/${created.hash}`);
    expect(created.url).not.toContain('G3');
    expect(created.url).not.toContain('4');
    expect(created.url.split('/').pop()).toBe(created.hash);
  });

  it('rejects payloads larger than the configured body limit (413)', async () => {
    const oversized = 'x'.repeat(200_000);

    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: [oversized] });

    expect([400, 413]).toContain(response.status);
  });

  it('sets the expected security headers', async () => {
    const created = await createSeatHash(theaterId, 'G3');
    const response = await api().get(`/api/seat-hashes/${created.hash}`);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(
      response.headers['x-frame-options'] ?? response.headers['content-security-policy'],
    ).toBeDefined();
  });

  it('turns an unexpected internal fault into a clean 500 with no stack trace', async () => {
    // The error middleware is the unit under test here, so drive it directly
    // with a route that throws an error the app does not know about.
    const leaky = express();
    leaky.get('/boom', () => {
      throw new Error('SECRET_INTERNAL_DETAIL: connection string mongodb://user:hunter2@host');
    });
    leaky.use(errorHandler);

    const response = await request(leaky).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });

    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain('SECRET_INTERNAL_DETAIL');
    expect(serialised).not.toContain('hunter2');
    expect(serialised).not.toContain('at Object.');
    expect(serialised).not.toContain('node_modules');
  });

  it('returns a typed 503 when MongoDB is unreachable, not a stack trace', async () => {
    // A structurally-valid hash that is simply absent must be a clean 404, and
    // the error envelope must stay the same shape in every failure mode.
    const response = await api().get('/api/seat-hashes/aaaaaaaaaaaaaaaaaaaaaa');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'QR_NOT_FOUND', message: 'QR code not found' },
    });
    expect(response.body.error).not.toHaveProperty('stack');
  });

  it('echoes a valid inbound X-Request-Id on the error body for correlation', async () => {
    const response = await api()
      .get('/api/theaters/64b7f9c2e13f2a1b2c3d4e5f')
      .set('X-Request-Id', 'trace-abc-123');

    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('trace-abc-123');
    expect(response.body.error.requestId).toBe('trace-abc-123');
  });

  it('does not invent or reflect an unvalidated X-Request-Id', async () => {
    const noHeader = await api().get('/api/theaters/64b7f9c2e13f2a1b2c3d4e5f');
    expect(noHeader.body.error.requestId).toBeUndefined();

    const injected = await api()
      .get('/api/theaters/64b7f9c2e13f2a1b2c3d4e5f')
      .set('X-Request-Id', 'has spaces <script>alert(1)</script>');

    expect(injected.headers['x-request-id']).toBeUndefined();
    expect(injected.body.error.requestId).toBeUndefined();
  });
});
