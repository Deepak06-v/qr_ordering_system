#!/usr/bin/env node
/**
 * Phase 1 + Phase 2 acceptance and load check against a *running* server.
 *
 *   npm run build && npm start          # in one shell
 *   node scripts/acceptance.js          # in another
 *
 * Override the target with API_BASE_URL. This exercises the real HTTP surface,
 * the QR payload contract, the mock order -> payment -> PIN flow, the
 * theater-scoped Socket.io events, and the intermission-spike concurrency target
 * (200 simultaneous seat resolutions).
 */
const crypto = require('node:crypto');

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5000}`;
const EXPECTED_APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:5173';

let failures = 0;
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
const pass = (label, detail = '') => console.log(`  PASS  ${label}${detail ? '  ' + detail : ''}`);
const check = (cond, label, detail = '') => {
  if (cond) pass(label, detail);
  else {
    failures += 1;
    console.log(`  FAIL  ${label}  ${detail}`);
  }
};

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, body: json, text };
}

const data = (r) => r.body?.data;
const code = (r) => r.body?.error?.code;

async function main() {
  console.log(`\nPhase 1 + 2 acceptance against ${BASE}\n${'='.repeat(66)}`);

  /* ------------------------------------------------------------------ */
  console.log('\n[1] health + readiness');
  const health = await call('GET', '/health');
  check(health.status === 200, 'GET /health returns 200', `status=${health.status}`);
  check(data(health)?.status === 'ok', 'service reports healthy', JSON.stringify(data(health)));

  /* ------------------------------------------------------------------ */
  console.log('\n[2] theater CRUD');
  const stamp = crypto.randomBytes(3).toString('hex');
  const name = `Acceptance ${stamp}`;
  const created = await call('POST', '/api/theaters', {
    name,
    address: 'Acceptance Road',
    city: 'Pune',
    timezone: 'Asia/Kolkata',
  });
  check(
    created.status === 201,
    'POST /api/theaters returns 201',
    `status=${created.status} ${created.text.slice(0, 160)}`,
  );
  const theaterId = data(created)?.id;
  check(Boolean(theaterId), 'theater id returned', String(theaterId));
  check(data(created)?.timezone === 'Asia/Kolkata', 'timezone persisted', data(created)?.timezone);
  check(data(created)?.isActive === true, 'new theater is active');

  const badTz = await call('POST', '/api/theaters', {
    name: `${name} B`,
    timezone: 'Mars/Olympus',
  });
  check(badTz.status === 400, 'invalid timezone rejected', `code=${code(badTz)}`);

  const dup = await call('POST', '/api/theaters', { name, city: 'Pune' });
  check(
    dup.status === 409,
    'duplicate theater name returns 409',
    `status=${dup.status} code=${code(dup)}`,
  );
  const dupCase = await call('POST', '/api/theaters', { name: name.toUpperCase(), city: 'Pune' });
  check(
    dupCase.status === 409,
    'duplicate name is case-insensitive',
    `status=${dupCase.status} code=${code(dupCase)}`,
  );

  const list = await call('GET', '/api/theaters?search=' + encodeURIComponent(stamp));
  check(
    list.status === 200 && data(list)?.items?.length === 1,
    'GET /api/theaters filters by search',
    `total=${data(list)?.total}`,
  );

  const patched = await call('PATCH', `/api/theaters/${theaterId}`, { name: `${name} Renamed` });
  check(
    patched.status === 200 && data(patched)?.name.endsWith('Renamed'),
    'PATCH renames theater',
    data(patched)?.name,
  );

  const emptyPatch = await call('PATCH', `/api/theaters/${theaterId}`, {});
  check(emptyPatch.status === 400, 'empty PATCH rejected', `code=${code(emptyPatch)}`);

  /* ------------------------------------------------------------------ */
  console.log('\n[3] bulk seat QR generation (atomic)');
  const seats = [];
  for (let row = 1; row <= 10; row += 1) {
    for (let col = 1; col <= 20; col += 1) seats.push(`R${row}S${col}`);
  }
  const bulk = await call('POST', '/api/seat-hashes/bulk', { theaterId, screenNumber: 1, seats });
  check(
    bulk.status === 201,
    'POST /api/seat-hashes/bulk returns 201',
    `status=${bulk.status} count=${bulk.body?.count} ${bulk.text.slice(0, 160)}`,
  );
  const items = data(bulk) ?? [];
  check(
    items.length === seats.length,
    'every requested seat got a mapping',
    `${items.length}/${seats.length}`,
  );
  check(items[0]?.seatNumber === 'R1S1', 'requested seat order is preserved', items[0]?.seatNumber);
  check(
    items.every((i) => typeof i.hash === 'string' && /^[A-Za-z0-9_-]{22}$/.test(i.hash)),
    'every hash is 22-char base64url',
    `sample=${items[0]?.hash}`,
  );
  check(new Set(items.map((i) => i.hash)).size === items.length, 'every hash is unique');
  check(
    items.every((i) => i.isActive === true),
    'new mappings start active',
  );

  const overlap = await call('POST', '/api/seat-hashes/bulk', {
    theaterId,
    screenNumber: 1,
    seats: ['R1S1', 'R9S9'],
  });
  check(
    overlap.status === 409,
    'overlapping batch rejected atomically',
    `status=${overlap.status} code=${code(overlap)}`,
  );
  const afterOverlap = await call(
    'GET',
    `/api/seat-hashes?theaterId=${theaterId}&screenNumber=1&limit=500`,
  );
  check(
    data(afterOverlap)?.total === seats.length,
    'rejected batch wrote nothing',
    `total=${data(afterOverlap)?.total} expected=${seats.length}`,
  );

  const dupInBatch = await call('POST', '/api/seat-hashes/bulk', {
    theaterId,
    screenNumber: 2,
    seats: ['A1', 'A1'],
  });
  check(
    dupInBatch.status === 400,
    'duplicate seat inside one request rejected',
    `code=${code(dupInBatch)}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\n[4] QR payload contract (nothing but the hash is encoded)');
  const url = items[0]?.url;
  const parsed = new URL(url);
  check(
    parsed.origin === new URL(EXPECTED_APP_BASE_URL).origin,
    'URL origin is APP_BASE_URL',
    parsed.origin,
  );
  check(parsed.pathname === `/${items[0]?.hash}`, 'URL path is exactly /<hash>', parsed.pathname);
  check(
    parsed.search === '' && parsed.hash === '',
    'URL carries no query string or fragment',
    `search="${parsed.search}" hash="${parsed.hash}"`,
  );
  check(
    !/screen|seat|theater/i.test(parsed.pathname),
    'URL path leaks no seat/screen/theater metadata',
  );
  check(
    items.every((i) => i.url === `${EXPECTED_APP_BASE_URL}/${i.hash}`),
    'every item url is APP_BASE_URL + hash',
  );

  /* ------------------------------------------------------------------ */
  console.log('\n[5] QR images');
  const h0 = items[0].hash;
  const png = await fetch(`${BASE}/api/seat-hashes/${h0}/qr`);
  const pngBuf = Buffer.from(await png.arrayBuffer());
  check(
    png.status === 200 && pngBuf.subarray(1, 4).toString() === 'PNG',
    'GET /:hash/qr returns a real PNG',
    `${pngBuf.length} B, ${png.headers.get('content-type')}`,
  );
  const w = pngBuf.readUInt32BE(16);
  const hgt = pngBuf.readUInt32BE(20);
  check(
    w === hgt && w % 4 === 0 && w >= 120,
    'PNG is square with a 4-module quiet zone',
    `${w}x${hgt}`,
  );
  check(
    Number(png.headers.get('content-length')) === pngBuf.length,
    'Content-Length matches the body',
  );
  check(
    /attachment; filename="seat-R1S1\.png"/.test(png.headers.get('content-disposition') ?? ''),
    'PNG downloads with a seat filename',
    png.headers.get('content-disposition'),
  );

  const svgRes = await fetch(`${BASE}/api/seat-hashes/${h0}/qr.svg`);
  const svgText = await svgRes.text();
  check(
    svgRes.status === 200 && svgText.trimStart().startsWith('<svg'),
    'GET /:hash/qr.svg returns SVG',
    `${svgText.length} B`,
  );

  const dataUrl = await call('GET', `/api/seat-hashes/${h0}/qr/data-url`);
  check(
    typeof data(dataUrl)?.dataUrl === 'string' &&
      data(dataUrl).dataUrl.startsWith('data:image/png;base64,'),
    'GET /:hash/qr/data-url returns an inline data URL',
  );

  /* ------------------------------------------------------------------ */
  console.log('\n[6] ZIP export');
  const zipRes = await fetch(`${BASE}/api/seat-hashes/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theaterId, screenNumber: 1 }),
  });
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  check(
    zipRes.status === 200 && zipBuf.subarray(0, 4).toString('hex') === '504b0304',
    'POST /export streams a ZIP',
    `${(zipBuf.length / 1024).toFixed(1)} KiB`,
  );
  check(zipRes.headers.get('content-type') === 'application/zip', 'ZIP content-type');
  check(
    zipRes.headers.get('content-disposition') === 'attachment; filename="screen-1-qrs.zip"',
    'ZIP named screen-N-qrs.zip',
    zipRes.headers.get('content-disposition'),
  );
  check(
    zipRes.headers.get('x-qr-count') === String(seats.length),
    'X-QR-Count header reports the seat count',
    zipRes.headers.get('x-qr-count'),
  );
  const zipText = zipBuf.toString('latin1');
  check(zipText.includes('manifest.csv'), 'archive contains manifest.csv');
  check(
    zipText.includes('R1S1.png') && zipText.includes('R10S20.png'),
    'archive contains a PNG per seat',
  );
  check(!/verificationPin/i.test(zipText), 'archive never contains a verification PIN field');

  /* ------------------------------------------------------------------ */
  console.log('\n[7] customer resolution (only the QR hash is trusted)');
  const resolve = await call('GET', `/api/seat-hashes/${items[0].hash}`);
  check(resolve.status === 200, 'GET /:hash returns 200', `status=${resolve.status}`);
  const r0 = data(resolve);
  check(r0?.seatNumber === 'R1S1', 'resolves the correct seat', r0?.seatNumber);
  check(r0?.screenNumber === 1, 'resolves the correct screen', String(r0?.screenNumber));
  check(r0?.theater?.name === `${name} Renamed`, 'resolves the correct theater', r0?.theater?.name);
  check(r0?.theater?.timezone === 'Asia/Kolkata', 'resolves theater timezone');
  check(!('verificationPinHash' in (r0 ?? {})), 'never leaks the PIN hash');
  check(
    typeof r0?.theater?.id === 'string' && r0.theater.id.length === 24,
    'nested theater exposes a public id',
    r0?.theater?.id,
  );

  const s2 = await call('POST', '/api/seat-hashes/bulk', {
    theaterId,
    screenNumber: 2,
    seats: ['R1S1'],
  });
  const otherHash = data(s2)[0].hash;
  const spoof = await call(
    'GET',
    `/api/seat-hashes/${otherHash}?seatNumber=R10S20&screenNumber=1&theaterId=${theaterId}`,
  );
  check(
    spoof.status === 200 && data(spoof)?.seatNumber === 'R1S1',
    'client-supplied seat/theater params are ignored',
    `got=${data(spoof)?.seatNumber}`,
  );

  const unknown = await call('GET', '/api/seat-hashes/aaaaaaaaaaaaaaaaaaaaaa');
  check(unknown.status === 404, 'unknown hash returns 404', `code=${code(unknown)}`);
  const malformed = await call('GET', '/api/seat-hashes/not-a-hash');
  check(malformed.status === 400, 'malformed hash returns 400', `code=${code(malformed)}`);
  const traversal = await call('GET', '/api/seat-hashes/..%2F..%2Fetc%2Fpasswd');
  check(
    traversal.status === 400 || traversal.status === 404,
    'path traversal attempt is rejected',
    `status=${traversal.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\n[8] deactivation -> 410 Gone');
  const off = await call('PATCH', `/api/seat-hashes/${items[0].hash}/status`, {
    isActive: false,
    reason: 'acceptance test',
  });
  check(off.status === 200 && data(off)?.isActive === false, 'PATCH /:hash/status deactivates');
  const gone = await call('GET', `/api/seat-hashes/${items[0].hash}`);
  check(gone.status === 410, 'deactivated code returns 410', `code=${code(gone)}`);
  const offImage = await fetch(`${BASE}/api/seat-hashes/${items[0].hash}/qr`);
  check(
    offImage.status === 200,
    'the physical sticker can still be printed/downloaded',
    `status=${offImage.status}`,
  );
  await offImage.arrayBuffer();

  const zip2Res = await fetch(`${BASE}/api/seat-hashes/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theaterId, screenNumber: 1 }),
  });
  await zip2Res.arrayBuffer();
  check(
    zip2Res.headers.get('x-qr-count') === String(seats.length - 1),
    'deactivated code is excluded from ZIP by default',
    zip2Res.headers.get('x-qr-count'),
  );

  const zip3Res = await fetch(`${BASE}/api/seat-hashes/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theaterId, screenNumber: 1, includeInactive: true }),
  });
  await zip3Res.arrayBuffer();
  check(
    zip3Res.headers.get('x-qr-count') === String(seats.length),
    'includeInactive:true brings it back',
    zip3Res.headers.get('x-qr-count'),
  );
  await call('PATCH', `/api/seat-hashes/${items[0].hash}/status`, { isActive: true });

  /* ------------------------------------------------------------------ */
  console.log('\n[9] remapping (sticker hash never changes)');
  const busy = await call('PATCH', `/api/seat-hashes/${items[1].hash}`, { seatNumber: 'R1S1' });
  check(
    busy.status === 409,
    'remap onto a taken seat is rejected',
    `status=${busy.status} code=${code(busy)}`,
  );
  const free = await call('PATCH', `/api/seat-hashes/${items[1].hash}`, {
    seatNumber: 'R10S20',
    screenNumber: 2,
  });
  check(
    free.status === 200 &&
      data(free)?.seatNumber === 'R10S20' &&
      data(free)?.hash === items[1].hash,
    'remap moves the seat and preserves the hash',
    `${data(free)?.hash} -> ${data(free)?.seatNumber}`,
  );
  const afterRemap = await call('GET', `/api/seat-hashes/${items[1].hash}`);
  check(
    data(afterRemap)?.screenNumber === 2 && data(afterRemap)?.seatNumber === 'R10S20',
    'the same URL now resolves to the new seat',
  );
  await call('PATCH', `/api/seat-hashes/${items[1].hash}`, { seatNumber: 'R1S2', screenNumber: 1 });

  /* ------------------------------------------------------------------ */
  console.log('\n[10] menu');
  const item = await call('POST', '/api/menu', {
    theaterId,
    category: 'Beverages',
    name: 'Acceptance Cola',
    description: 'Test item',
    price: 4950,
  });
  check(
    item.status === 201,
    'POST /api/menu returns 201',
    `status=${item.status} ${item.text.slice(0, 160)}`,
  );
  const menuId = data(item)?.id;
  check(data(item)?.price === 4950, 'price stored as integer paise', String(data(item)?.price));
  check(
    data(item)?.priceRupees === 49.5,
    'derived rupees view is non-authoritative',
    String(data(item)?.priceRupees),
  );
  check(
    data(item)?.category === 'BEVERAGES',
    'category normalised to uppercase',
    data(item)?.category,
  );

  const floatPrice = await call('POST', '/api/menu', {
    theaterId,
    category: 'Beverages',
    name: 'Float',
    price: 49.5,
  });
  check(
    floatPrice.status === 400,
    'non-integer paise rejected outright',
    `code=${code(floatPrice)}`,
  );
  const negPrice = await call('POST', '/api/menu', {
    theaterId,
    category: 'Beverages',
    name: 'Bad',
    price: -1,
  });
  check(negPrice.status === 400, 'negative price rejected', `code=${code(negPrice)}`);

  const menuList = await call('GET', `/api/menu/${theaterId}`);
  check(
    menuList.status === 200 &&
      Array.isArray(data(menuList)) &&
      data(menuList).some((i) => i.id === menuId),
    'GET /api/menu/:theaterId lists items',
    `count=${data(menuList)?.length}`,
  );
  await call('PATCH', `/api/menu/items/${menuId}`, { isAvailable: false });
  const hidden = await call('GET', `/api/menu/${theaterId}`);
  check(!data(hidden).some((i) => i.id === menuId), 'unavailable item hidden by default');
  const shown = await call('GET', `/api/menu/${theaterId}?includeUnavailable=true`);
  check(
    data(shown).some((i) => i.id === menuId),
    'includeUnavailable=true reveals it',
  );
  const del = await call('DELETE', `/api/menu/items/${menuId}`);
  check(
    del.status === 200 || del.status === 204,
    'DELETE /api/menu/items/:id removes it',
    `status=${del.status}`,
  );

  /* ------------------------------------------------------------------ */
  console.log('\n[11] intermission spike: 200 simultaneous scans');
  const spike = await call('POST', '/api/seat-hashes/bulk', {
    theaterId,
    screenNumber: 3,
    seats: Array.from({ length: 200 }, (_, i) => `S${i + 1}`),
  });
  check(
    spike.status === 201,
    'a 200-seat screen can be provisioned in one call',
    `count=${spike.body?.count}`,
  );
  const spikeHashes = data(spike).map((i) => i.hash);

  const t0 = performance.now();
  const results = await Promise.all(spikeHashes.map((h) => call('GET', `/api/seat-hashes/${h}`)));
  const resolveMs = performance.now() - t0;
  const ok = results.filter((r) => r.status === 200).length;
  check(ok === 200, 'all 200 concurrent resolutions returned 200', `${ok}/200`);
  check(
    resolveMs < 3000,
    `200 scans resolved in ${n1(resolveMs)} ms`,
    `${n1(resolveMs / 200)} ms avg`,
  );

  const t1 = performance.now();
  const images = await Promise.all(
    spikeHashes.map((h) => fetch(`${BASE}/api/seat-hashes/${h}/qr`)),
  );
  const imgMs = performance.now() - t1;
  await Promise.all(images.map((r) => r.arrayBuffer()));
  check(
    images.every((r) => r.status === 200),
    'all 200 QR images served',
    `status=${images[0]?.status}`,
  );
  check(imgMs < 8000, `200 QR images generated in ${n1(imgMs)} ms`, `${n1(imgMs / 200)} ms avg`);

  const t2 = performance.now();
  const svgImages = await Promise.all(
    spikeHashes.map((h) => fetch(`${BASE}/api/seat-hashes/${h}/qr.svg`)),
  );
  const svgMs = performance.now() - t2;
  await Promise.all(svgImages.map((r) => r.text()));
  check(
    svgImages.every((r) => r.status === 200),
    'all 200 QR SVGs served',
  );
  check(svgMs < 4000, `200 QR SVGs generated in ${n1(svgMs)} ms`, `${n1(svgMs / 200)} ms avg`);

  /* ------------------------------------------------------------------ */
  console.log('\n[12] error envelope + request correlation');
  const notFound = await call('GET', '/api/does-not-exist');
  check(
    notFound.status === 404 && notFound.body?.error?.code === 'INVALID_REQUEST',
    'unknown route returns the error envelope',
    JSON.stringify(notFound.body?.error?.code),
  );
  const badId = await call('GET', '/api/theaters/not-an-object-id');
  check(badId.status === 400, 'malformed ObjectId rejected', `code=${code(badId)}`);

  const noId = await call('GET', '/api/theaters/not-an-object-id');
  check(
    noId.body?.error?.requestId === undefined,
    'no requestId is invented when the client sends none',
  );

  const traced = await call('GET', '/api/theaters/not-an-object-id');
  check(
    traced.status === 400,
    'baseline error before correlation checks',
    `status=${traced.status}`,
  );
  const tracedRes = await fetch(`${BASE}/api/theaters/not-an-object-id`, {
    headers: { 'x-request-id': 'acceptance-trace-001' },
  });
  const tracedBody = await tracedRes.json();
  check(tracedRes.status === 400, 'traced error keeps its status', `status=${tracedRes.status}`);
  check(
    tracedRes.headers.get('x-request-id') === 'acceptance-trace-001',
    'X-Request-Id is echoed back',
    tracedRes.headers.get('x-request-id'),
  );
  check(
    tracedBody?.error?.requestId === 'acceptance-trace-001',
    'error body carries the requestId for support correlation',
    tracedBody?.error?.requestId,
  );

  const spoofed = await fetch(`${BASE}/api/theaters/not-an-object-id`, {
    headers: { 'x-request-id': 'bad id with spaces and <script>' },
  });
  const spoofedBody = await spoofed.json();
  check(spoofed.headers.get('x-request-id') === null, 'a malformed X-Request-Id is not echoed');
  check(spoofedBody?.error?.requestId === undefined, 'a malformed X-Request-Id is not reflected');

  const isDev = (process.env.NODE_ENV ?? 'development') !== 'production';
  const hasStack = Boolean(tracedBody?.error?.details?.stack);
  check(
    hasStack === isDev,
    `stack traces are ${isDev ? 'present in dev' : 'absent in production'}`,
    `hasStack=${hasStack}`,
  );

  /* ------------------------------------------------------------------ */
  /* Phase 2: orders, mock payment, KDS, realtime                        */
  /* ------------------------------------------------------------------ */

  console.log('\n[13] order creation is priced on the server');

  // A second theater, so the realtime scoping check below has a control.
  const otherName = `Acceptance Other ${stamp}`;
  const otherTheater = await call('POST', '/api/theaters', {
    name: otherName,
    city: 'Pune',
    timezone: 'Asia/Kolkata',
  });
  check(otherTheater.status === 201, 'control theater created', `status=${otherTheater.status}`);
  const otherTheaterId = data(otherTheater)?.id;

  const seat = await call('POST', '/api/seat-hashes', {
    theaterId: data(created)?.id,
    screenNumber: 4,
    seatNumber: 'G3',
  });
  check(seat.status === 201, 'seat QR created', `status=${seat.status}`);
  const hash = data(seat)?.hash;

  const menuItem = await call('POST', '/api/menu', {
    theaterId: data(created)?.id,
    name: 'Classic Popcorn',
    category: 'popcorn',
    price: 18000,
  });
  check(menuItem.status === 201, 'menu item created', `status=${menuItem.status}`);
  const itemId = data(menuItem)?.id;

  // A client that tries to dictate the price must be rejected outright.
  const tampered = await call('POST', '/api/orders', {
    hash,
    items: [{ itemId, quantity: 1, price: 1 }],
  });
  check(
    tampered.status === 400 && code(tampered) === 'VALIDATION_ERROR',
    'a client-supplied price is rejected, not ignored',
    `status=${tampered.status} code=${code(tampered)}`,
  );

  const order = await call('POST', '/api/orders', {
    hash,
    items: [{ itemId, quantity: 2 }],
  });
  check(order.status === 201, 'POST /api/orders returns 201', `status=${order.status}`);
  const placed = data(order);
  const orderId = placed?.orderId;

  check(placed?.status === 'PENDING_PAYMENT', 'a new order is not yet paid', placed?.status);
  check(placed?.paymentStatus === 'PENDING', 'payment status starts PENDING', placed?.paymentStatus);
  check(
    placed?.totalAmount === 36000,
    'total is computed server-side from the menu price',
    `total=${placed?.totalAmount} (expected 36000)`,
  );
  check(
    /^FM-\d+$/.test(placed?.orderNumber ?? ''),
    'a human-facing order number was issued',
    placed?.orderNumber,
  );
  check(placed?.verificationPin === undefined, 'no PIN is issued before payment');

  const fetched = await call('GET', `/api/orders/${orderId}`);
  check(fetched.status === 200, 'GET /api/orders/:id returns 200', `status=${fetched.status}`);
  check(
    !fetched.text.includes('verificationPin') && !fetched.text.includes(hash),
    'the order detail omits both the PIN and the seat QR hash',
  );

  console.log('\n[14] mock payment, PIN issuance and idempotency');

  const payment = await call('POST', `/api/orders/${orderId}/payments`);
  check(payment.status === 201, 'POST payments returns 201', `status=${payment.status}`);
  const paymentId = data(payment)?.paymentId;
  check(
    /^mock_pay_[0-9a-f]{16}$/.test(paymentId ?? ''),
    'the mock provider issued a payment id',
    paymentId,
  );
  check(data(payment)?.amount === 36000, 'payment amount matches the order total');
  check(data(payment)?.simulated === true, 'the response is flagged as a simulation');

  const paymentAgain = await call('POST', `/api/orders/${orderId}/payments`);
  check(
    data(paymentAgain)?.paymentId === paymentId,
    're-opening a payment is idempotent (no double charge)',
    data(paymentAgain)?.paymentId,
  );

  const concurrent = await Promise.all(
    Array.from({ length: 3 }, () => call('POST', `/api/orders/${orderId}/payments`)),
  );
  check(
    new Set(concurrent.map((r) => data(r)?.paymentId)).size === 1,
    'three concurrent payment requests yield one payment id',
  );

  // Checked while the order is still unpaid: once it is PAID, verify is an
  // idempotent no-op that returns the order regardless of the id supplied.
  const unknownPayment = await call('POST', `/api/orders/${orderId}/payments/verify`, {
    paymentId: `mock_pay_${'0'.repeat(16)}`,
  });
  check(
    unknownPayment.status === 404 && code(unknownPayment) === 'PAYMENT_NOT_FOUND',
    'an unknown payment id is rejected',
    `status=${unknownPayment.status} code=${code(unknownPayment)}`,
  );

  const cardAttempt = await call('POST', `/api/orders/${orderId}/payments/verify`, {
    paymentId,
    cardNumber: '4111111111111111',
    cvv: '123',
  });
  check(
    cardAttempt.status === 400,
    'card details in the verify body are rejected, not collected',
    `status=${cardAttempt.status}`,
  );

  const verified = await call('POST', `/api/orders/${orderId}/payments/verify`, { paymentId });
  check(verified.status === 200, 'POST payments/verify returns 200', `status=${verified.status}`);
  const pin = verified.body?.data?.verificationPin;
  check(
    /^\d{4}$/.test(pin ?? ''),
    'a 4-digit delivery PIN is returned on confirmation',
    pin,
  );
  check(verified.body?.data?.order?.status === 'PAID', 'the order is now PAID');
  check(verified.body?.data?.order?.paidAt, 'paidAt is recorded');
  check(verified.body?.data?.alreadyCompleted === false, 'the first verify is the one that completes');

  const reverified = await call('POST', `/api/orders/${orderId}/payments/verify`, { paymentId });
  check(reverified.status === 200, 'repeating verify is not an error', `status=${reverified.status}`);
  check(reverified.body?.data?.alreadyCompleted === true, 'the repeat reports alreadyCompleted');
  check(
    reverified.body?.data?.verificationPin === undefined,
    'the repeat does not hand out a second PIN (only a hash is stored)',
  );
  check(reverified.body?.data?.order?.status === 'PAID', 'the order stays PAID');

  // The PIN must not be recoverable from any read endpoint.
  const afterGet = await call('GET', `/api/orders/${orderId}`);
  check(!afterGet.text.includes(pin), 'the PIN is not readable from GET /api/orders/:id');

  const paidTwice = await call('POST', `/api/orders/${orderId}/payments`);
  check(
    paidTwice.status === 409 && code(paidTwice) === 'ORDER_ALREADY_PAID',
    'a paid order cannot be paid again',
    `status=${paidTwice.status} code=${code(paidTwice)}`,
  );

  console.log('\n[15] KDS feed and status transitions');

  const feed = await call('GET', `/api/orders?theaterId=${data(created)?.id}`);
  check(feed.status === 200, 'GET /api/orders returns 200', `status=${feed.status}`);
  check(data(feed)?.total === 1, 'the theater feed holds the new order', `total=${data(feed)?.total}`);
  check(
    data(feed)?.items?.[0]?.orderNumber === placed?.orderNumber,
    'the feed reports the human-facing order number',
    data(feed)?.items?.[0]?.orderNumber,
  );
  check(
    !feed.text.includes('verificationPin'),
    'the KDS feed never contains a plaintext PIN field',
  );
  check(!feed.text.includes(pin), 'the KDS feed does not contain the delivered PIN');

  const otherFeed = await call('GET', `/api/orders?theaterId=${otherTheaterId}`);
  check(
    data(otherFeed)?.total === 0,
    "one cinema's orders never appear in another cinema's feed",
    `total=${data(otherFeed)?.total}`,
  );

  const noTheater = await call('GET', '/api/orders');
  check(
    noTheater.status === 400,
    'the order feed cannot be listed without a theaterId',
    `status=${noTheater.status}`,
  );

  const markPaid = await call('PATCH', `/api/orders/${orderId}/status`, { status: 'PAID' });
  check(
    markPaid.status === 400,
    'a staff status change cannot mark an order paid',
    `status=${markPaid.status} code=${code(markPaid)}`,
  );

  const skipAhead = await call('PATCH', `/api/orders/${orderId}/status`, { status: 'DELIVERED' });
  check(
    skipAhead.status === 409 && code(skipAhead) === 'INVALID_STATUS_TRANSITION',
    'a paid order cannot jump straight to DELIVERED',
    `status=${skipAhead.status} code=${code(skipAhead)}`,
  );

  for (const status of ['PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    const stepped = await call('PATCH', `/api/orders/${orderId}/status`, { status });
    check(
      stepped.status === 200 && data(stepped)?.status === status,
      `order advances to ${status}`,
      `status=${stepped.status} state=${data(stepped)?.status}`,
    );
  }

  const afterDelivery = await call('PATCH', `/api/orders/${orderId}/status`, {
    status: 'CANCELLED',
  });
  check(
    afterDelivery.status === 409,
    'DELIVERED is terminal',
    `status=${afterDelivery.status} code=${code(afterDelivery)}`,
  );

  console.log('\n[16] theater-scoped realtime events');

  const { io: ioClient } = require('socket.io-client');
  const kds = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });
  const bystander = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });

  const join = (socket, theaterId) =>
    new Promise((resolve) => {
      socket.once('kds:joined', resolve);
      socket.emit('kds:join', { theaterId });
    });
  const waitFor = (socket, event, ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        resolve(undefined);
      }, ms);
      function handler(body) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(body);
      }
      socket.on(event, handler);
    });

  const joined = await join(kds, data(created)?.id);
  check(
    Array.isArray(joined?.rooms) && joined.rooms[0] === `theater:${data(created)?.id}`,
    'a KDS client joins its theater room',
    JSON.stringify(joined?.rooms),
  );
  const joinedOther = await join(bystander, otherTheaterId);
  check(
    joinedOther?.rooms?.[0] === `theater:${otherTheaterId}`,
    'a second client joins a different theater room',
    JSON.stringify(joinedOther?.rooms),
  );

  const badJoin = await new Promise((resolve) => {
    kds.once('kds:join-failed', resolve);
    kds.emit('kds:join', { theaterId: 'not-an-id' });
  });
  check(badJoin?.reason === 'INVALID_THEATER_ID', 'a malformed theater id is refused', badJoin?.reason);

  // A fresh order, so the event under test is unambiguous.
  const liveOrder = await call('POST', '/api/orders', { hash, items: [{ itemId, quantity: 1 }] });
  const liveOrderId = data(liveOrder)?.orderId;

  // An unpaid order must be invisible to the kitchen.
  const earlyNew = waitFor(kds, 'order:new', 400);
  const earlyUpdated = waitFor(kds, 'order:updated', 400);
  await new Promise((resolve) => setTimeout(resolve, 400));
  check(
    (await earlyNew) === undefined && (await earlyUpdated) === undefined,
    'an unpaid order emits no realtime event',
  );

  const livePayment = await call('POST', `/api/orders/${liveOrderId}/payments`);
  const newEventPromise = waitFor(kds, 'order:new', 5000);
  const leakPromise = waitFor(bystander, 'order:new', 1500);

  const liveVerified = await call('POST', `/api/orders/${liveOrderId}/payments/verify`, {
    paymentId: data(livePayment)?.paymentId,
  });
  const newEvent = await newEventPromise;
  const leaked = await leakPromise;

  check(liveVerified.status === 200, 'the live order was paid', `status=${liveVerified.status}`);
  check(
    newEvent?.orderNumber === data(liveOrder)?.orderNumber,
    'order:new reached the theater KDS with the order number',
    `${newEvent?.orderNumber} vs ${data(liveOrder)?.orderNumber}`,
  );
  check(
    newEvent?.theaterId === data(created)?.id,
    'order:new is scoped to the paying theater',
    newEvent?.theaterId,
  );
  check(
    /^\d{4}$/.test(newEvent?.verificationPin ?? ''),
    'order:new carries the delivery PIN for kitchen verification',
    newEvent?.verificationPin,
  );
  check(
    newEvent?.verificationPin === liveVerified.body?.data?.verificationPin,
    'the PIN the kitchen received matches the one the customer received',
  );
  check(leaked === undefined, "another cinema's KDS received nothing");

  const updatePromise = waitFor(kds, 'order:updated', 5000);
  await call('PATCH', `/api/orders/${liveOrderId}/status`, { status: 'PREPARING' });
  const updateEvent = await updatePromise;
  check(
    updateEvent?.status === 'PREPARING',
    'order:updated is emitted when the kitchen advances an order',
    updateEvent?.status,
  );
  check(
    updateEvent?.verificationPin === undefined,
    'order:updated does not re-broadcast the PIN',
  );

  const cancelPromise = waitFor(kds, 'order:cancelled', 5000);
  await call('PATCH', `/api/orders/${liveOrderId}/status`, { status: 'CANCELLED' });
  const cancelEvent = await cancelPromise;
  check(
    cancelEvent?.status === 'CANCELLED',
    'order:cancelled is emitted when an order is cancelled',
    cancelEvent?.status,
  );

  kds.disconnect();
  bystander.disconnect();

  /* ------------------------------------------------------------------ */
  console.log(`\n${'='.repeat(66)}`);
  console.log(
    failures === 0 ? 'ALL ACCEPTANCE CHECKS PASSED\n' : `${failures} ACCEPTANCE CHECK(S) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
