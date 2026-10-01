# Theater Ordering — Phase 2 Backend

In-theater dynamic QR ordering platform. **Phase 1** delivered the foundation:
theaters, the physical seat-QR sticker lifecycle, menu management, and the
real-time event foundation. **Phase 2** builds the transaction on top of it: a
server-priced order, an isolated mock payment, a per-order delivery PIN, the
kitchen order feed, and theater-scoped Socket.io events.

Still **out of scope**: any frontend, customer accounts, staff authentication,
and real payment gateway integration. The MVP provider moves no money.

---

## Quick start

```bash
cd backend
npm install
cp .env.example .env          # adjust MONGODB_URI if needed
npm run seed                 # optional: demo cinema, 280 seat QRs, 12 menu items
npm run dev                  # http://localhost:5000
```

Verify a running server end to end (requires the server to be up):

```bash
npm run build && npm start   # shell 1
npm run acceptance           # shell 2
```

Run the full quality gate:

```bash
npm run verify               # typecheck + lint + tests + build
```

---

## Configuration

All configuration is validated at boot by Zod — a missing or malformed variable
fails fast with a readable message instead of surfacing as a runtime error later.

| Variable                | Required | Default                           | Notes                                        |
| ----------------------- | -------- | --------------------------------- | -------------------------------------------- |
| `NODE_ENV`              | yes      | `development`                     | `development` \| `test` \| `production`      |
| `PORT`                  | yes      | `5000`                            |                                              |
| `MONGODB_URI`           | yes      | —                                 | Must not be logged.                          |
| `APP_BASE_URL`          | yes      | —                                 | Baked into QR codes. **No trailing slash.**  |
| `CORS_ORIGIN`           | yes      | —                                 | Comma-separated allow-list, or `*`.          |
| `MONGODB_URI_TEST`      | no       | `MONGODB_URI` with `-test` suffix | Database the test suite wipes.               |
| `QR_HASH_BYTES`         | no       | `16`                              | 16 bytes → 22 base64url characters.          |
| `MONGODB_MAX_POOL_SIZE` | no       | `20`                              |                                              |
| `JSON_BODY_LIMIT`       | no       | `100kb`                           |                                              |
| `BULK_SEAT_MAX`         | no       | `500`                             | Upper bound on a single bulk screen request. |
| `LOG_LEVEL`             | no       | `info`                            | `silent` disables all logging.               |
| `PAYMENT_PROVIDER`      | no       | `mock`                            | Only `mock` is implemented. See below.       |
| `MOCK_PAYMENT_DELAY_MS` | no       | `500`                             | Artificial latency; `0` in tests.            |
| `ORDER_NUMBER_PREFIX`   | no       | `FM`                              | Order numbers render as `FM-1042`.           |

`.env` is gitignored. Secrets are never written to logs: `MONGODB_URI` and
credential-shaped keys are redacted, and the structured access log deliberately
omits request/response bodies so a QR hash can never leak into it.

---

## The core idea: a QR hash is a capability

A seat QR sticker encodes **nothing but a random, unguessable hash**:

```
http://localhost:5173/a8f7K2mQx91PvL4sAbCdEfGh
└──── APP_BASE_URL ────┘ └──────── 16 CSPRNG bytes ────────┘
```

There is no seat number, screen number, theater id, counter, or checksum in the
payload. Consequences that the code enforces:

- **The sticker is unforgeable.** A client cannot invent a valid URL.
- **The seat is never client-controlled.** `GET /api/seat-hashes/:hash` derives
  the theater, screen and seat _only_ from the hash. Seat/theater/screen query
  or body parameters on that endpoint are ignored (covered by a test).
- **A hash is not a secret to rotate.** Rotation would invalidate printed
  stickers, so a mapping is _remapped_, never re-issued. `PATCH /:hash` moves a
  seat and preserves the hash, so the physical sticker keeps working.
- **Hashes are never sequential.** 16 bytes of `crypto.randomBytes` gives 2^128
  possibilities, so there is no enumeration attack.

### Lifecycle states

| State       | `GET /:hash`                | Included in ZIP                   | Sticker still printable |
| ----------- | --------------------------- | --------------------------------- | ----------------------- |
| Active      | `200` + theater/screen/seat | yes (default)                     | yes                     |
| Deactivated | `410 Gone`                  | only with `includeInactive: true` | yes                     |
| Unknown     | `404`                       | —                                 | —                       |

Deactivation retires the _mapping_; the printed sticker may still be on a wall,
so the image endpoints keep working. That is intentional.

---

## API

All responses share one envelope.

```jsonc
// success
{ "success": true, "data": { } }
// paginated list
{ "success": true, "data": { "items": [], "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
// error
{ "success": false, "error": { "code": "QR_INACTIVE", "message": "…", "requestId": "…" } }
```

The KDS order feed uses the same list shape: `{ items, total, limit, skip }`.

`requestId` appears only when the client sends a valid inbound `X-Request-Id`;
it is echoed in the header and body so a support report maps to one log line.
Malformed ids are dropped rather than reflected (log-injection defence).
Stack traces are emitted **only** when `NODE_ENV=development`.

### Health

| Method | Path      | Purpose                              |
| ------ | --------- | ------------------------------------ |
| `GET`  | `/health` | Liveness + MongoDB connection state. |

### Theaters

| Method   | Path                | Purpose                                                                      |
| -------- | ------------------- | ---------------------------------------------------------------------------- |
| `POST`   | `/api/theaters`     | Create. `409 THEATER_DUPLICATE` on a name clash (case-insensitive).          |
| `GET`    | `/api/theaters`     | Paginated directory. Filters: `isActive`, `city`, `search`, `page`, `limit`. |
| `GET`    | `/api/theaters/:id` | Fetch one. `404 THEATER_NOT_FOUND`.                                          |
| `PATCH`  | `/api/theaters/:id` | Partial update; rejects an empty body and name clashes.                      |
| `DELETE` | `/api/theaters/:id` | Soft deactivate.                                                             |

A theater name is unique (collation-insensitive) via a real unique index; the
service pre-checks for a clean `409` and the index is the tie-breaker under
concurrent requests.

### Seat QR codes

| Method  | Path                                 | Purpose                                               |
| ------- | ------------------------------------ | ----------------------------------------------------- |
| `POST`  | `/api/seat-hashes`                   | One mapping.                                          |
| `POST`  | `/api/seat-hashes/bulk`              | Whole screen at once, **atomically**.                 |
| `GET`   | `/api/seat-hashes`                   | Admin listing. Requires `theaterId`.                  |
| `GET`   | `/api/seat-hashes/:hash`             | **Customer resolution.** Theater, screen, seat.       |
| `GET`   | `/api/seat-hashes/:hash/qr`          | PNG (`image/png`, attachment).                        |
| `GET`   | `/api/seat-hashes/:hash/qr.svg`      | Vector SVG.                                           |
| `GET`   | `/api/seat-hashes/:hash/qr/data-url` | Inline `data:` URL for the web client.                |
| `POST`  | `/api/seat-hashes/export`            | Streamed ZIP: one PNG per seat + `manifest.csv`.      |
| `PATCH` | `/api/seat-hashes/:hash`             | Remap to another seat/screen/theater. Hash preserved. |
| `PATCH` | `/api/seat-hashes/:hash/status`      | `{ "isActive": false, "reason": "…" }`.               |

```bash
curl -X POST localhost:5000/api/seat-hashes/bulk -H 'content-type: application/json' \
  -d '{"theaterId":"<id>","screenNumber":1,"seats":["A1","A2","B1"]}'
```

**Bulk atomicity.** All-or-nothing, via whichever mechanism the deployment
supports:

- _Replica set / Atlas_ → a real MongoDB transaction.
- _Standalone `mongod`_ → a pre-flight duplicate check, then a compensating
  delete if the write fails partway.

Either way a rejected batch writes **nothing**, and a partial screen can never
be created. Two partial unique indexes back this up: one on
`theaterId + screenNumber + seatNumber` filtered to `isActive: true`, and one on
`hash`. Deactivating a seat frees its slot without touching history.

### Menu

Prices are transported and stored as **integer paise** (`25000` = ₹250). A
client sending `250.5` or `"250.50"` is rejected outright rather than silently
rounded, so a cart total can never drift from the menu price. A derived
`priceRupees` field is included for display only and is never authoritative.

| Method   | Path                   | Purpose                                                                       |
| -------- | ---------------------- | ----------------------------------------------------------------------------- |
| `POST`   | `/api/menu`            | Create. `409 DUPLICATE_MENU_ITEM` on a name clash.                            |
| `GET`    | `/api/menu/:theaterId` | Menu for a theater. Hides unavailable items unless `includeUnavailable=true`. |
| `GET`    | `/api/menu/items/:id`  | Fetch one.                                                                    |
| `PATCH`  | `/api/menu/items/:id`  | Partial update.                                                               |
| `DELETE` | `/api/menu/items/:id`  | Remove.                                                                       |

### Orders

| Method   | Path                          | Purpose                                            |
| -------- | ----------------------------- | -------------------------------------------------- |
| `POST`   | `/api/orders`                 | Place an order. Server-priced. `PENDING_PAYMENT`.  |
| `GET`    | `/api/orders/:id`             | Order state. Never contains a PIN.                 |
| `GET`    | `/api/orders?theaterId=…`     | KDS feed for one theater, newest first.            |
| `PATCH`  | `/api/orders/:id/status`      | Staff status change.                                |

**The client is trusted with three things only**: the QR hash it scanned, which
menu item ids it wants, and how many of each. `createOrderSchema` is `.strict()`
and has no `price`, `totalAmount`, `name`, `screenNumber` or `seatNumber` field,
so a tampered price is a `400` rather than a silently ignored key. The seat and
theater are derived from the hash; names, prices and the total are read from
MongoDB and **snapshotted** onto the order, so later menu edits do not rewrite
order history.

Orders get a human-facing `orderNumber` (`FM-1042`) from a dedicated `Counter`
document advanced with a single atomic `$inc`. A `countDocuments()`-derived
number would collide under concurrency and would reissue a number after a
deletion. Gaps are expected and harmless — a gap would leak order volume.

#### Status lifecycle

```
PENDING_PAYMENT ──verify payment──▶ PAID ──▶ PREPARING ──▶ OUT_FOR_DELIVERY ──▶ DELIVERED
        │                            │           │                │
        └── cannot be set by PATCH ───┴───────────┴────────────────┴──▶ CANCELLED
```

`PENDING_PAYMENT` is reachable **only** by creating an order, and left **only**
by payment verification. It is excluded from the `PATCH` status enum, so no
staff call — and no unauthenticated caller reaching a dev endpoint — can skip the
payment step. `DELIVERED` and `CANCELLED` are terminal, and a transition may not
skip a state (`PAID → DELIVERED` is a `409`).

### Payments

| Method | Path                                      | Purpose                                          |
| ------ | ----------------------------------------- | ------------------------------------------------ |
| `POST` | `/api/orders/:id/payments`                | Open a payment attempt. Idempotent.              |
| `POST` | `/api/orders/:id/payments/verify`         | Confirm it. The only path to `PAID`.             |

The whole provider surface is one interface, `PaymentService`
(`createPayment` / `verifyPayment`). `MockPaymentService` is the only
implementation; `payment.service.ts` is the single place the provider is chosen,
keyed off `PAYMENT_PROVIDER`.

Going live is a contained change:

1. add `'razorpay'` to the `PAYMENT_PROVIDER` enum in `config/env.ts` (it will
   fail loudly, not fall back to the mock, until you do);
2. write a `RazorpayPaymentService implements PaymentService`;
3. add one `case` in `payment.service.ts`.

No order, controller or route code changes — they only ever see the interface.

**The MVP provider moves no money.** It deliberately has no card, CVV, UPI or OTP
field anywhere: collecting credentials we cannot process safely would be worse
than collecting none. Card details sent to the verify endpoint are rejected by
`.strict()` rather than stored.

**Money is integer paise** end to end. Amount, payment amount and order total are
all compared as integers, so a rounding difference can never mark an order paid.

### The delivery PIN

- 4 digits, generated with a **rejection-sampling uniform** CSPRNG generator
  (`Math.random() % 10000` is biased, and a biased PIN is guessable).
- Stored **only** as a `scrypt` hash in a `select: false` field. The plaintext
  exists in exactly two responses: the payment confirmation, and the `order:new`
  event to that theater's kitchen.
- **Issued exactly once.** The payment is claimed with a conditional
  `PENDING → COMPLETED` update; whichever request wins generates the PIN. Repeat
  calls return `alreadyCompleted: true` and **no** PIN, because only a hash is
  stored and reissuing one would invalidate the copy the kitchen already has.
- If a crash lands between the payment write and the order write, the next
  verify self-heals: the order is completed and a fresh PIN issued, since the
  original was never handed to anyone.
- `order:updated` and `order:cancelled` **never** carry a PIN. This is enforced
  in the emitter, not left to call-site discipline.

### Idempotency and concurrency

`POST /payments` is idempotent while a payment is pending, backed by a
**partial unique index** (`{ orderId: 1 }` where `status: 'PENDING'`) — the
atomic guard a pre-flight check alone cannot provide. Three concurrent requests
produce one payment id, verified in both the test suite and the acceptance run.

Verification is safe under concurrency and crash: conditional updates decide a
single winner, the loser returns the already-completed order, and a lost
order-write is repaired on the next attempt.

---

## Security posture

- **No authentication exists at all**, by design — this product has no accounts.
  That now has two concrete consequences worth stating plainly rather than
  burying:
  - `GET /api/orders/:id` is reachable by anyone who knows an order id, so **the
    order id is currently acting as a bearer secret**. Before launch, replace it
    with a short-lived order-scoped token issued at payment confirmation.
  - `PATCH /api/orders/:id/status` can mark an order `DELIVERED`, and
    `GET /api/orders` exposes a theater's whole order volume. Both must sit
    behind a gateway or staff auth before any internet exposure.
- **Helmet** security headers, a strict CORS allow-list, and a bounded JSON
  body limit.
- **Strict Zod schemas** (`z.strict()`) on every body, so unknown fields are
  rejected instead of silently ignored. This is what makes a client-supplied
  price and injected card details hard errors.
- **CSPRNG everywhere**: `crypto.randomBytes` for hashes, a rejection-sampling
  uniform 4-digit generator for verification PINs, and `scrypt` for PIN storage.
- **Constant-time comparison** for anything secret-derived.
- **No secret in logs**, no response bodies in access logs, no internal error
  detail or stack traces outside development. No code path logs a PIN.
- **Path-traversal safe**: the hash route matches a base64url-only character
  set, and seat labels are sanitised before becoming ZIP entry filenames.

---

## Real-time

Socket.io runs on the same HTTP server, with CORS following the same
`CORS_ORIGIN` allow-list (never `origin: true`).

Rooms are **per theater** — `theater:{theaterId}`, plus
`theater:{theaterId}:screen:{n}` for a split-kitchen view. There is no global
room, so one cinema's tickets can never reach another's screen. A KDS client
joins with `{ event: 'kds:join', data: { theaterId, screenNumber? } }` and
receives `kds:joined` or `kds:join-failed`.

| Event             | Direction       | When                                                |
| ----------------- | --------------- | --------------------------------------------------- |
| `order:new`       | server → room   | Payment verified. The only event carrying the PIN.   |
| `order:updated`   | server → room   | Staff status change. No PIN.                         |
| `order:cancelled` | server → room   | Order cancelled. No PIN.                             |

**No event fires for an unpaid order** — the kitchen has nothing to do until
money has moved, and an unpaid order must never appear on a screen. Both facts
are asserted in the test suite and in the acceptance run.

---

## Testing

```bash
npm test                 # 194 tests, 9 suites
npm run test:coverage
npm run acceptance       # live HTTP + Socket.io acceptance, server must be running
```

Tests use a **real local MongoDB** (`MONGODB_URI_TEST`, wiped before and after
the suite) rather than mocks, so indexes, unique constraints and partial indexes
are genuinely exercised.

Covered: theater CRUD and uniqueness; hash format, uniqueness and CSPRNG
properties; bulk atomicity including a full 200-seat screen; the URL contract;
PNG/SVG/data-URL rendering; streamed ZIP contents; resolution, remap and
deactivation semantics; menu money handling; PIN hashing; request-id
propagation; and a security suite asserting that customer input cannot reach
seat selection and that internals never appear in a response.

Phase 2 adds: server-side pricing and price tampering, QR-hash-derived seats,
sold-out and cross-theater item rejection, unique monotonic order numbers under
concurrent creation, the full status lifecycle including its illegal edges, PIN
issuance-once semantics, self-healing, declined-payment handling, payment
idempotency and concurrency, and Socket.io room scoping with a real client
(asserting one cinema's KDS receives nothing for another's order).

The `acceptance` script runs the same flows over real HTTP **and a real
Socket.io connection** against a running server, and additionally verifies the
intermission-spike target — 200 simultaneous scans. Measured on a local `mongod`:
**200 concurrent resolutions in ~0.8 s (~4 ms each), 200 QR PNGs in ~3.6 s
(~18 ms each), 200 QR SVGs in ~0.8 s**.

> Note: QR rendering appears ~70× slower under Jest than in production. That is
> a `pngjs` de-optimisation inside the Jest VM, not a server characteristic —
> the acceptance numbers above are the real ones.

---

## Project layout

```
src/
  config/        env validation, MongoDB pool + lifecycle
  models/        Theater, SeatHash, MenuItem, Order, Payment, Counter
  validators/    strict Zod schemas, one module per domain
  services/      business logic; the only layer that touches Mongoose
    payment/     PaymentService interface + MockPaymentService + provider registry
  controllers/   thin HTTP adapters over the services
  routes/        URL → validator → controller wiring
  middleware/    validation, error envelope, request id, access log
  socket/        Socket.io bootstrap and theater-room event catalogue
  utils/         hashing, transactions, errors, logging, mongo helpers
scripts/
  seed.ts        idempotent development seed
  acceptance.js  live HTTP + Socket.io acceptance + load check
tests/           Jest + Supertest integration suite
```

Service layer holds the rules; controllers only translate HTTP. Business
invariants (unique active seat, name uniqueness, order-number uniqueness, one
pending payment per order, money handling) are enforced by database indexes as
the final authority, not by application checks alone.

`order-status.ts` deliberately lives outside `models/Order.ts`: the order model
re-exports the PIN crypto from `pin.service.ts`, which needs to know which
statuses are still live, and a shared constants module is what keeps those two
files from importing each other.
