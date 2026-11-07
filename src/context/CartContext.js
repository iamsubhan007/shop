'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSite } from '@/context/SiteContext';

const CartContext = createContext(null);
const CART_KEY = 'hbt_cart_v2'; // v2: items now reference database ids

export function CartProvider({ children }) {
  const { settings } = useSite();
  const [items, setItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderType, setOrderType] = useState('delivery'); // 'delivery' | 'pickup'
  const [customerLocation, setCustomerLocation] = useState(null); // { lat, lng, distanceKm, isEligible, address }

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY);
      if (stored) {
        setItems(JSON.parse(stored));
      }
      const storedType = localStorage.getItem('hbt_order_type');
      if (storedType) {
        setOrderType(storedType);
      }
      const storedLoc = localStorage.getItem('hbt_delivery_location');
      if (storedLoc) {
        setCustomerLocation(JSON.parse(storedLoc));
      }
    } catch (e) {
      console.warn('Failed to parse stored cart:', e);
    }
  }, []);

  // Save to localStorage whenever items change
  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save cart:', e);
    }
  }, [items]);

  const addToCart = (product, qty = 1, notes = '') => {
    const itemKey = product.id + (notes ? `-${notes}` : '');
    setItems((prevItems) => {
      const existingIndex = prevItems.findIndex((i) => i.cartKey === itemKey);
      if (existingIndex > -1) {
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + qty,
        };
        return updated;
      }

      const newItem = {
        cartKey: itemKey,
        id: product.id,
        product_id: product.is_deal ? null : product.id,
        deal_id: product.is_deal ? product.id : null,
        title: product.title || product.name,
        price: Number(product.price),
        image_url: product.image_url || product.pic,
        quantity: qty,
        notes: notes || '',
        is_deal: Boolean(product.is_deal),
        genre: product.genre || 'Food',
      };
      return [...prevItems, newItem];
    });

    setIsCartOpen(true);
  };

  const updateQuantity = (cartKey, newQty) => {
    if (newQty <= 0) {
      removeFromCart(cartKey);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.cartKey === cartKey ? { ...item, quantity: newQty } : item
      )
    );
  };

  const removeFromCart = (cartKey) => {
    setItems((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const clearCart = () => {
    setItems([]);
    try {
      localStorage.removeItem(CART_KEY);
    } catch {}
  };

  const updateOrderType = (type) => {
    setOrderType(type);
    try {
      localStorage.setItem('hbt_order_type', type);
    } catch {}
  };

  const updateCustomerLocation = (loc) => {
    setCustomerLocation(loc);
    try {
      localStorage.setItem('hbt_delivery_location', JSON.stringify(loc));
    } catch {}
  };

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Display-only estimate; the server recomputes the real fee at checkout.
  const feeCfg = settings?.delivery || { fee: 0, free_over: 0 };
  const isFreeDelivery = Number(feeCfg.free_over) > 0 && subtotal >= Number(feeCfg.free_over);
  const deliveryFee = orderType === 'pickup' || !items.length ? 0 : isFreeDelivery ? 0 : Number(feeCfg.fee) || 0;
  const total = subtotal + deliveryFee;

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        deliveryFee,
        total,
        orderType,
        setOrderType: updateOrderType,
        customerLocation,
        setCustomerLocation: updateCustomerLocation,
        isCartOpen,
        openCart: () => setIsCartOpen(true),
        closeCart: () => setIsCartOpen(false),
        toggleCart: () => setIsCartOpen((prev) => !prev),
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        isFreeDelivery,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
