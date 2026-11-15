import 'server-only';

/**
 * What a rider is allowed to see about an order. This is an explicit allow-list: it is built field by field, so
 * nothing else on the order (phone, email, tracking token, customer id, payment reference or screenshot) can ever
 * reach a rider, even if columns are added to the orders table later.
 *
 * A rider sees: order number, the customer's NAME, where to deliver (address and map position), the items and the
 * bill (invoice detail), and whether cash has to be collected.
 */
export function riderView(o, items) {
  const cod = o.paymentMethod === 'cod';
  const toCollect = cod && o.paymentStatus === 'cod_pending';
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    placedAt: o.createdAt,
    customerName: o.customerName,
    address: o.deliveryAddress,
    lat: o.deliveryLat == null ? null : Number(o.deliveryLat),
    lng: o.deliveryLng == null ? null : Number(o.deliveryLng),
    distanceM: o.distanceKm == null ? null : Math.round(Number(o.distanceKm) * 1000),
    specialInstructions: o.specialInstructions,
    items: items.map((i) => ({ id: i.id, title: i.itemTitle, quantity: i.quantity, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotalPrice), notes: i.notes })),
    subtotal: Number(o.subtotal),
    discountAmount: Number(o.discountAmount),
    deliveryFee: Number(o.deliveryFee),
    totalAmount: Number(o.totalAmount),
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    collectCash: toCollect,
    amountToCollect: toCollect ? Number(o.totalAmount) : 0,
  };
}
