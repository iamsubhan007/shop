// Order status workflow (shared by server and UI). Payment status is tracked separately.

export const ORDER_STATUSES = [
  'Placed',
  'Payment Pending',
  'Payment Verification',
  'Confirmed',
  'Cooking',
  'Ready for Pickup',
  'Out for Delivery',
  'Completed',
  'Cancelled',
  'Rejected',
];

export const TERMINAL = ['Completed', 'Cancelled', 'Rejected'];
export const CUSTOMER_CANCELLABLE = ['Placed', 'Payment Pending', 'Payment Verification'];

export const PAYMENT_METHODS = {
  pickup: ['bank_transfer', 'jazzcash', 'easypaisa'], // no COD for pickup
  delivery: ['bank_transfer', 'jazzcash', 'easypaisa', 'cod'],
};

export const PAYMENT_LABELS = {
  bank_transfer: 'Bank Transfer',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  cod: 'Cash on Delivery',
};

/** Allowed next statuses from `from` for an order of the given type. */
export function nextStatuses(from, orderType) {
  const ready = orderType === 'pickup' ? 'Ready for Pickup' : 'Out for Delivery';
  const map = {
    Placed: ['Confirmed', 'Cancelled', 'Rejected'],
    'Payment Pending': ['Payment Verification', 'Cancelled', 'Rejected'],
    'Payment Verification': ['Confirmed', 'Payment Pending', 'Cancelled', 'Rejected'],
    Confirmed: ['Cooking', 'Cancelled'],
    Cooking: [ready, 'Cancelled'],
    'Ready for Pickup': ['Completed'],
    'Out for Delivery': ['Completed'],
  };
  return map[from] || [];
}

/**
 * Once an order is placed, staff (owner, admin and kitchen) can never cancel or reject it: only the customer can
 * cancel it, and only until it has been accepted (see CUSTOMER_CANCELLABLE). Staff accept it and then fulfil it.
 */
export const STAFF_NEVER_ENDS = ['Cancelled', 'Rejected'];

/**
 * Orders that are waiting to be accepted. These raise the alarm in the staff portal until someone accepts them
 * or the customer cancels. 'Payment Pending' (a prepaid order the customer has not paid yet) is deliberately left
 * out: nobody on staff can act on it, and since staff cannot cancel it, it would ring forever if abandoned.
 * It starts ringing as soon as the customer submits payment ('Payment Verification').
 * Kitchen only hears orders it can accept itself; payment checks belong to owner/admin.
 */
export const NEEDS_ACCEPTANCE = {
  owner: ['Placed', 'Payment Verification'],
  admin: ['Placed', 'Payment Verification'],
  kitchen: ['Placed'],
};

/** Which transitions each staff role may perform. Kitchen only handles cooking/dispatch steps. */
export function roleCanTransition(role, from, to) {
  if (STAFF_NEVER_ENDS.includes(to)) return false;
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'kitchen') {
    return (from === 'Placed' && to === 'Confirmed') || // COD only: prepaid is blocked until payment is verified
      (from === 'Confirmed' && to === 'Cooking') ||
      (from === 'Cooking' && (to === 'Ready for Pickup' || to === 'Out for Delivery')) ||
      ((from === 'Ready for Pickup' || from === 'Out for Delivery') && to === 'Completed');
  }
  return false;
}

export const statusColor = (s) =>
  ({ Completed: 'bg-emerald-100 text-emerald-800', Cancelled: 'bg-zinc-200 text-zinc-700', Rejected: 'bg-red-100 text-red-800' }[s] || 'bg-amber-100 text-amber-800');

/** Steps shown on the customer progress timeline. */
export function timelineSteps(orderType, paymentMethod) {
  const prepaid = paymentMethod !== 'cod';
  return [
    'Placed',
    ...(prepaid ? ['Payment Verification'] : []),
    'Confirmed',
    'Cooking',
    orderType === 'pickup' ? 'Ready for Pickup' : 'Out for Delivery',
    'Completed',
  ];
}
