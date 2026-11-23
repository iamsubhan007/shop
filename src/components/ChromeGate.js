'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useCart } from '@/context/CartContext';

// The cart drawer is only needed once someone opens the cart, so its code is downloaded then, not with every page.
const CartDrawer = dynamic(() => import('@/components/cart/CartDrawer'), { ssr: false });

// Customer chrome (navbar, cart) is never shown inside the admin area.
export default function ChromeGate({ drawer = false }) {
  const path = usePathname();
  const { isCartOpen } = useCart();
  if (path?.startsWith('/admin')) return null;
  if (!drawer) return <Navbar />;
  return isCartOpen ? <CartDrawer /> : null;
}
