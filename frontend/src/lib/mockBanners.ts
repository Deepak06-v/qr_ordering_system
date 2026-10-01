import type { PromoBanner } from '@/api/types';

/**
 * Mock promotional banners for the MVP.
 *
 * In production these will come from `GET /api/banners`. The structure mirrors
 * the backend `PromoBanner` model so the UI stays stable when the endpoint
 * lands. Do not scatter banner content throughout components - this is the
 * single source of truth for the carousel.
 *
 * Images are served from /images/banners/ (public folder).
 * Product linking uses the MenuItem.id from the test fixtures.
 */
export const MOCK_BANNERS: PromoBanner[] = [
  {
    id: 'banner-large-popcorn',
    title: 'Large Popcorn',
    subtitle: 'Freshly popped & salted',
    imageUrl: '/images/banners/movie-night-combo.jpg',
    price: 35000, // ₹350 in paise
    productId: '66a1b2c3d4e5f60718293b01', // Large Popcorn
    active: true,
    displayOrder: 1,
  },
  {
    id: 'banner-premium-popcorn',
    title: 'Premium Caramel Popcorn',
    subtitle: 'Hand-crafted sweet & salty',
    imageUrl: '/images/banners/premium-caramel-popcorn.jpg',
    price: 28000, // ₹280 in paise
    productId: '66a1b2c3d4e5f60718293b02', // Medium Popcorn (using as proxy)
    active: true,
    displayOrder: 2,
  },
  {
    id: 'banner-family-bundle',
    title: 'Family Bundle',
    subtitle: 'Nachos + Drinks for sharing',
    imageUrl: '/images/banners/family-bundle.jpg',
    price: 45000, // ₹450 in paise
    productId: '66a1b2c3d4e5f60718293b03', // Nachos
    active: true,
    displayOrder: 3,
  },
];

/** Filter for only active banners, sorted by display order. */
export function getActiveBanners(): PromoBanner[] {
  return MOCK_BANNERS.filter((banner) => banner.active).sort((a, b) => a.displayOrder - b.displayOrder);
}