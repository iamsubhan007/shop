'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Receipt, ArrowRight, Clock, Bike, Store, ShoppingBag, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function OrdersListPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const url = user?.id ? `/api/orders?userId=${user.id}` : '/api/orders';
        const res = await fetch(url);
        const data = await res.json();
        if (data.orders) {
          setOrders(data.orders);
        }
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [user]);

  return (
    <div className="min-h-screen bg-zinc-50/70 pb-20">
      <div className="bg-zinc-950 text-white border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Receipt className="text-red-600" size={24} />
            My Orders
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track your recent and past orders with live tandoor & delivery updates.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <Loader2 size={32} className="text-red-700 animate-spin mb-2" />
            <span className="text-xs font-semibold text-zinc-500">Loading orders...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center bg-white rounded-3xl border border-zinc-200 p-8 shadow-xs">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag size={28} />
            </div>
            <h2 className="text-lg font-bold text-zinc-900">No Orders Placed Yet</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              When you place an order, its live tracking status will appear here.
            </p>
            <Link
              href="/Menu"
              className="mt-5 px-6 py-2.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-full shadow transition-colors"
            >
              Browse Menu
            </Link>
          </div>
        ) : (
          <div className="space-y-3.5">
            {orders.map((order) => {
              const isPending = order.status === 'Payment Pending';
              const isCompleted = order.status === 'Completed';

              return (
                <Link
                  key={order.id || order.order_number}
                  href={`/orders/${order.id || order.order_number}`}
                  className="block bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-red-200 transition-all group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-zinc-900 group-hover:text-red-700 transition-colors">
                          #{order.order_number}
                        </span>
                        <span className="text-[11px] text-zinc-400">
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-600">
                        {order.order_type === 'delivery' ? (
                          <span className="flex items-center gap-1 text-zinc-500">
                            <Bike size={13} className="text-red-700" /> Delivery
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-zinc-500">
                            <Store size={13} className="text-red-700" /> Pickup
                          </span>
                        )}
                        <span>&bull;</span>
                        <span className="font-bold text-zinc-900">Rs. {order.total_amount}</span>
                        {order.items && (
                          <>
                            <span>&bull;</span>
                            <span className="text-zinc-500">{order.items.length} items</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isPending
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-red-700 text-white'
                        }`}
                      >
                        {order.status}
                      </span>
                      <ArrowRight size={16} className="text-zinc-400 group-hover:text-red-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
