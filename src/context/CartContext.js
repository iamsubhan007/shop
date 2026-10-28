'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { initialShopSettings } from '@/lib/data/initialData';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderType, setOrderType] = useState('delivery'); // 'delivery' | 'pickup'
  const [customerLocation, setCustomerLocation] = useState(null); // { lat, lng, distanceKm, isEligible, address }

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hbt_cart');
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
      localStorage.setItem('hbt_cart', JSON.stringify(items));
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
      localStorage.removeItem('hbt_cart');
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

  // Delivery fee logic: free if pickup, or if subtotal >= free threshold (Rs. 2500)
  const isFreeDelivery = subtotal >= initialShopSettings.free_delivery_threshold_rs;
  const deliveryFee = orderType === 'pickup' ? 0 : isFreeDelivery ? 0 : initialShopSettings.delivery_fee_rs;
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
