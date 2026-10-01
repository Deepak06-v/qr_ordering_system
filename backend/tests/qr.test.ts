import type { Response as SupertestResponse } from 'supertest';
import { env } from '../src/config/env';
import {
  QR_OPTIONS,
  buildQrUrl,
  generateQrDataUrl,
  generateQrPng,
  generateQrSvg,
  qrFileNameForSeat,
  qrPixelSize,
} from '../src/services/qr.service';
import { SeatHash } from '../src/models/SeatHash';
import { api, createSeatHash, createTheater, readPngSize, textParser } from './helpers';

describe('QR generation service', () => {
  it('builds a URL that is only APP_BASE_URL + hash', () => {
    const hash = 'a8f7K2mQx91PvL4sAbCdEfGh';

    expect(buildQrUrl(hash)).toBe(`${env.APP_BASE_URL}/${hash}`);
    expect(buildQrUrl(hash)).not.toContain('?');
    expect(buildQrUrl(hash).split('/').pop()).toBe(hash);
  });

  it('is tuned for reliable scanning in a dark theater', () => {
    expect(QR_OPTIONS.errorCorrectionLevel).toBe('H');
    expect(QR_OPTIONS.margin).toBeGreaterThanOrEqual(4);
    expect(QR_OPTIONS.scale).toBeGreaterThanOrEqual(6);
    // Pure black on pure white: maximum contrast, nothing fancy.
    expect(QR_OPTIONS.color.dark).toBe('#000000ff');
    expect(QR_OPTIONS.color.light).toBe('#ffffffff');
  });

  it('renders a real PNG whose dimensions match the QR matrix', async () => {
    const hash = 'a8f7K2mQx91PvL4sAbCdEfGh';
    const png = await generateQrPng(hash);

    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');

    const { width, height } = readPngSize(png);
    expect(width).toBe(qrPixelSize(hash));
    expect(height).toBe(qrPixelSize(hash));
    // Big enough to print and scan across a room.
    expect(width).toBeGreaterThanOrEqual(300);
  });

  it('renders an SVG', async () => {
    const svg = await generateQrSvg('a8f7K2mQx91PvL4sAbCdEfGh');

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/viewBox/);
  });

  it('renders a data URL', async () => {
    const dataUrl = await generateQrDataUrl('a8f7K2mQx91PvL4sAbCdEfGh');

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('produces a different image for a different hash', async () => {
    const a = await generateQrPng('aaaaaaaaaaaaaaaaaaaaaa');
    const b = await generateQrPng('bbbbbbbbbbbbbbbbbbbbbb');

    expect(a.equals(b)).toBe(false);
  });

  it('sanitises seat labels for use as filenames', () => {
    expect(qrFileNameForSeat('G3')).toBe('G3.png');
    expect(qrFileNameForSeat('A-12')).toBe('A-12.png');
    expect(qrFileNameForSeat('A/12')).toBe('A_12.png');
    expect(qrFileNameForSeat('G3', 'svg')).toBe('G3.svg');
  });
});

describe('QR image endpoints', () => {
  let theaterId: string;
  let hash: string;

  beforeEach(async () => {
    theaterId = (await createTheater()).id;
    hash = (await createSeatHash(theaterId, 'G3')).hash;
  });

  it('GET /api/seat-hashes/:hash/qr returns image/png', async () => {
    const response = await api().get(`/api/seat-hashes/${hash}/qr`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toBe('attachment; filename="seat-G3.png"');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(readPngSize(response.body).width).toBe(qrPixelSize(hash));
  });

  it('GET /api/seat-hashes/:hash/qr.svg returns image/svg+xml', async () => {
    const response = await api().get(`/api/seat-hashes/${hash}/qr.svg`).buffer().parse(textParser);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.headers['content-disposition']).toBe('attachment; filename="seat-G3.svg"');
    expect(String(response.body)).toContain('<svg');
  });

  it('GET /api/seat-hashes/:hash/qr/data-url returns an inline data URL', async () => {
    const response = await api().get(`/api/seat-hashes/${hash}/qr/data-url`);

    expect(response.status).toBe(200);
    expect(response.body.data.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns 404 for an unknown hash', async () => {
    const response = await api().get('/api/seat-hashes/aaaaaaaaaaaaaaaaaaaaaa/qr');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('QR_NOT_FOUND');
  });

  it('returns 400 for a malformed hash', async () => {
    const response = await api().get('/api/seat-hashes/bad%2Fhash/qr');
    expect(response.status).toBe(400);
  });

  it('serves a QR for a deactivated code but the code no longer resolves to a seat', async () => {
    await api().patch(`/api/seat-hashes/${hash}/status`).send({ isActive: false });

    const image = await api().get(`/api/seat-hashes/${hash}/qr`);
    expect(image.status).toBe(200);

    const resolved = await api().get(`/api/seat-hashes/${hash}`);
    expect(resolved.status).toBe(410);
  });
});

describe('POST /api/seat-hashes/bulk', () => {
  let theaterId: string;

  beforeEach(async () => {
    theaterId = (await createTheater()).id;
  });

  it('creates one unique mapping per seat', async () => {
    const seats = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'G1', 'G2', 'G3'];

    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(9);
    expect(response.body.data).toHaveLength(9);

    const hashes = response.body.data.map((item: { hash: string }) => item.hash);
    expect(new Set(hashes).size).toBe(9);
    for (const item of response.body.data) {
      expect(item.url).toBe(`${env.APP_BASE_URL}/${item.hash}`);
    }

    const stored = await SeatHash.countDocuments({ theaterId, screenNumber: 4 });
    expect(stored).toBe(9);
  });

  it('preserves the requested seat order', async () => {
    const seats = ['G9', 'G1', 'A5'];
    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats });

    expect(response.body.data.map((item: { seatNumber: string }) => item.seatNumber)).toEqual(
      seats,
    );
  });

  it('rejects a batch that overlaps existing active seats without writing anything', async () => {
    await createSeatHash(theaterId, 'G3');

    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: ['A1', 'A2', 'G3', 'A3'] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DUPLICATE_QR');
    expect(response.body.error.message).toContain('G3');

    // Nothing from the rejected batch may have been persisted.
    const stored = await SeatHash.find({ theaterId, screenNumber: 4 }).lean();
    expect(stored).toHaveLength(1);
  });

  it('rejects duplicate seat names inside a single request (400)', async () => {
    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: ['A1', 'A2', 'A1'] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await SeatHash.countDocuments({ theaterId })).toBe(0);
  });

  it('rejects an empty seat list and a non-array', async () => {
    const empty = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: [] });
    expect(empty.status).toBe(400);

    const notArray = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: 'A1' });
    expect(notArray.status).toBe(400);
  });

  it('rejects a batch larger than the configured maximum (400)', async () => {
    const seats = Array.from({ length: env.BULK_SEAT_MAX + 1 }, (_, i) => `S${i + 1}`);

    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats });

    expect(response.status).toBe(400);
    expect(await SeatHash.countDocuments({ theaterId })).toBe(0);
  });

  it('rejects an unknown theater and creates nothing', async () => {
    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId: '64b7f9c2e13f2a1b2c3d4e5f', screenNumber: 4, seats: ['A1'] });

    expect(response.status).toBe(404);
    expect(await SeatHash.countDocuments({})).toBe(0);
  });

  it('handles a full-size screen batch atomically', async () => {
    const seats = Array.from({ length: 200 }, (_, i) => `R${i + 1}`);

    const response = await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats });

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(200);
    expect(await SeatHash.countDocuments({ theaterId, screenNumber: 4 })).toBe(200);
  });
});

describe('POST /api/seat-hashes/export (ZIP)', () => {
  let theaterId: string;

  beforeEach(async () => {
    theaterId = (await createTheater()).id;
    await api()
      .post('/api/seat-hashes/bulk')
      .send({ theaterId, screenNumber: 4, seats: ['G1', 'G2', 'G3', 'G4', 'G5'] });
  });

  const downloadZip = async (body: Record<string, unknown>): Promise<SupertestResponse> =>
    api()
      .post('/api/seat-hashes/export')
      .send(body)
      .buffer()
      .parse((res, callback): void => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  it('streams screen-N-qrs.zip with one PNG per seat plus manifest.csv', async () => {
    const response = await downloadZip({ theaterId, screenNumber: 4 });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe('attachment; filename="screen-4-qrs.zip"');
    expect(response.headers['x-qr-count']).toBe('5');

    const body = response.body as Buffer;
    // Local file header + end-of-central-directory signatures: a real archive.
    expect(body.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(body.subarray(body.length - 22, body.length - 18).toString('hex')).toBe('504b0506');

    const entries = body.toString('latin1');
    for (const seat of ['G1', 'G2', 'G3', 'G4', 'G5']) {
      expect(entries).toContain(`${seat}.png`);
    }
    expect(entries).toContain('manifest.csv');
    // Nothing sensitive is ever written next to the codes.
    expect(entries).not.toContain('verificationPin');
  });

  it('excludes inactive codes by default', async () => {
    const listed = await api()
      .get('/api/seat-hashes')
      .query({ theaterId, screenNumber: 4, isActive: 'true' });
    const target = listed.body.data.items[0] as { hash: string };
    await api().patch(`/api/seat-hashes/${target.hash}/status`).send({ isActive: false });

    const response = await downloadZip({ theaterId, screenNumber: 4 });

    expect(response.headers['x-qr-count']).toBe('4');
  });

  it('returns 404 when the screen has no QR codes', async () => {
    const response = await api()
      .post('/api/seat-hashes/export')
      .send({ theaterId, screenNumber: 9 });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('QR_NOT_FOUND');
  });

  it('validates the request body', async () => {
    const response = await api()
      .post('/api/seat-hashes/export')
      .send({ theaterId: 'nope', screenNumber: 0 });

    expect(response.status).toBe(400);
  });
});
