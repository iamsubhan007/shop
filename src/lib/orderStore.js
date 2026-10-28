// In-memory persistent order & product fallback store for development/preview
// When real Supabase credentials are configured, Supabase PostgreSQL is used directly.

if (!global._hbt_orders) {
  global._hbt_orders = [
    {
      id: 'demo-order-1',
      order_number: 'HBT-DEMO-01',
      user_id: null,
      order_type: 'delivery',
      status: 'Payment Pending',
      customer_name: 'Ahmed Khan',
      customer_phone: '03001234567',
      customer_email: 'ahmed@example.com',
      delivery_address: 'House 45, Block B, Model Town, Lahore',
      delivery_lat: 31.4850,
      delivery_lng: 74.3200,
      distance_km: 1.2,
      subtotal: 1550,
      delivery_fee: 100,
      total_amount: 1650,
      payment_status: 'pending',
      payment_method: 'bank_transfer',
      payment_reference: 'TRX-982341-MEEZAN',
      payment_proof_url: '',
      special_instructions: 'Please deliver extra hot and crispy.',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      items: [
        {
          id: 'item-1',
          item_title: 'Special Chicken Cheese Makhan Rogni Naan',
          unit_price: 670,
          quantity: 2,
          subtotal_price: 1340,
          notes: 'Crispy crust',
        },
        {
          id: 'item-2',
          item_title: 'Plain Rogani Naan',
          unit_price: 120,
          quantity: 1,
          subtotal_price: 120,
          notes: '',
        },
        {
          id: 'item-3',
          item_title: 'Zeera Mint Raita',
          unit_price: 60,
          quantity: 1,
          subtotal_price: 60,
          notes: '',
        }
      ]
    },
    {
      id: 'demo-order-2',
      order_number: 'HBT-DEMO-02',
      user_id: null,
      order_type: 'pickup',
      status: 'Preparing',
      customer_name: 'Usman Tariq',
      customer_phone: '03217654321',
      customer_email: 'usman@example.com',
      delivery_address: 'Self Pickup at Shop',
      subtotal: 1050,
      delivery_fee: 0,
      total_amount: 1050,
      payment_status: 'verified',
      payment_method: 'easypaisa',
      payment_reference: 'EP-449102-PK',
      payment_proof_url: '',
      special_instructions: 'Will pick up in 20 minutes.',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
      items: [
        {
          id: 'item-4',
          item_title: 'Crazy Deal 1',
          unit_price: 1050,
          quantity: 1,
          subtotal_price: 1050,
          notes: '2x Pizza Naan + Cola Next',
        }
      ]
    }
  ];
}

export const fallbackOrders = global._hbt_orders;

export function addFallbackOrder(order) {
  global._hbt_orders.unshift(order);
  return order;
}

export function getFallbackOrder(id) {
  return global._hbt_orders.find(o => o.id === id || o.order_number === id);
}

export function updateFallbackOrderStatus(id, updates) {
  const index = global._hbt_orders.findIndex(o => o.id === id || o.order_number === id);
  if (index !== -1) {
    global._hbt_orders[index] = {
      ...global._hbt_orders[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    return global._hbt_orders[index];
  }
  return null;
}
