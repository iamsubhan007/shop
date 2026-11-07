'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import CartDrawer from '@/components/cart/CartDrawer';

// Customer chrome (navbar, cart) is never shown inside the admin area.
export default function ChromeGate({ drawer = false }) {
  const path = usePathname();
  if (path?.startsWith('/admin')) return null;
  return drawer ? <CartDrawer /> : <Navbar />;
}
