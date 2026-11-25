// Where the delivery rider stands on the customer's progress track. Pure functions.

export function trackLabels(orderType) {
  return ['Confirmed', 'Cooking', orderType === 'pickup' ? 'Ready to pick' : 'Ready to go', 'Completed'];
}

/** -1 while the shop has not confirmed yet, then 0..3 (confirmed, cooking, ready / on the way, completed). */
export function trackStage(status) {
  return { Confirmed: 0, Cooking: 1, 'Ready for Pickup': 2, 'Out for Delivery': 2, Completed: 3 }[status] ?? -1;
}

/** '12:05' or '1:02:00'; '0:00' once the time has passed. */
export function countdownText(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}
