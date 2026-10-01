import { Route, Routes, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { LandingPage } from '@/pages/LandingPage';
import { OrderPage } from '@/pages/OrderPage';

/**
 * Two routes, deliberately.
 *
 * `/` is marketing and isolated. `/:hash` is the entire customer experience:
 * QR resolution, menu, cart, checkout, payment and PIN, all inside one route so
 * a scanned sticker never navigates the customer away from their order.
 */
export function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/:hash" element={<OrderPage />} />
      <Route path="*" element={<OrderPage />} />
    </Routes>
  );
}
