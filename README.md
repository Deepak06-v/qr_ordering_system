# FixMate Customer Frontend

Premium In-Theater QR Ordering Experience — Customer Side Only

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run test` | Run tests (Vitest) |
| `npm run verify` | Run all checks (typecheck + lint + test + build) |

---

## IMAGE GUIDE

### Products
All product images live in `frontend/public/images/products/`.

| Product | File |
|---------|------|
| Large Popcorn | `large-popcorn.svg` |
| Medium Popcorn | `regular-popcorn.svg` |
| Caramel Popcorn | `caramel-popcorn.svg` |
| Coke | `coke.svg` |
| Pepsi | `pepsi.svg` |
| Nachos | `nachos.svg` |
| Movie Night Combo | `movie-night-combo.svg` |
| Premium Caramel Popcorn | `premium-caramel-popcorn.svg` |
| Family Bundle | `family-bundle.svg` |

**Naming convention**: lowercase kebab-case matching the product ID (e.g., `movie-night-combo.svg` for product ID `movie-night-combo`).

**Format**: SVG preferred for vector scalability. WebP/AVIF acceptable for photographic assets.

**Dimensions**: 600×600px (1:1 aspect ratio) for product detail sheet.

---

### Banners
All promotional banner images live in `frontend/public/images/banners/`.

| Banner | File |
|--------|------|
| Movie Night Combo | `movie-night-combo.svg` |
| Premium Caramel Popcorn | `premium-caramel-popcorn.svg` |
| Family Bundle | `family-bundle.svg` |

**Naming convention**: lowercase kebab-case matching the banner ID (e.g., `movie-night-combo.svg` for banner ID `banner-movie-night-combo`).

**Format**: SVG preferred. WebP/AVIF acceptable.

**Dimensions**: 800×400px (16:8 / 2:1 aspect ratio) for carousel. All banners must share the same dimensions to prevent layout shift during auto-rotation.

---

### Adding New Images

1. Drop the image file into the correct folder (`products/` or `banners/`)
2. Follow the naming convention (kebab-case, matching the ID in data)
3. Update the corresponding data file:
   - Products: backend menu seeding (or future CMS)
   - Banners: `frontend/src/lib/mockBanners.ts` (MVP) or backend banner API
4. No component changes required — the UI resolves paths automatically

---

## Project Structure

```
frontend/
├── public/
│   └── images/
│       ├── products/
│       └── banners/
├── src/
│   ├── api/           # API client, types, endpoints
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Utilities, constants, mock data
│   ├── pages/         # Route components
│   ├── store/         # Zustand stores
│   └── test/          # Test utilities & fixtures
```

---

## Architecture Notes

- **Backend is source of truth**: Seat, prices, payment status, PIN, order status all come from the server
- **No frontend auth**: QR token = seat capability
- **Mock payment**: Uses `MockPaymentService` for MVP
- **Local persistence**: Cart and confirmed order stored in localStorage for resilience
- **Safe-area aware**: All fixed UI respects `env(safe-area-inset-*)`

---

## License

Private — FixMate internal use only