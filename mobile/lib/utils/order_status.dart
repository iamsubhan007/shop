/// Order workflow, mirroring src/lib/orderStatus.js on the server. The server is the authority: this only decides
/// which buttons to show.
library;

const orderStatuses = [
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

const terminalStatuses = ['Completed', 'Cancelled', 'Rejected'];
const customerCancellable = ['Placed', 'Payment Pending', 'Payment Verification'];

const paymentLabels = {
  'bank_transfer': 'Bank Transfer',
  'jazzcash': 'JazzCash',
  'easypaisa': 'EasyPaisa',
  'cod': 'Cash on Delivery',
};

String paymentLabel(String method) => paymentLabels[method] ?? method;

String readable(String value) => value.replaceAll('_', ' ');

/// No cash on delivery for pickup.
List<String> paymentMethodsFor(String orderType) => orderType == 'pickup'
    ? const ['bank_transfer', 'jazzcash', 'easypaisa']
    : const ['bank_transfer', 'jazzcash', 'easypaisa', 'cod'];

List<String> nextStatuses(String from, String orderType) {
  final ready = orderType == 'pickup' ? 'Ready for Pickup' : 'Out for Delivery';
  return switch (from) {
    'Placed' => ['Confirmed', 'Cancelled', 'Rejected'],
    'Payment Pending' => ['Payment Verification', 'Cancelled', 'Rejected'],
    'Payment Verification' => ['Confirmed', 'Payment Pending', 'Cancelled', 'Rejected'],
    'Confirmed' => ['Cooking', 'Cancelled'],
    'Cooking' => [ready, 'Cancelled'],
    'Ready for Pickup' => ['Completed'],
    'Out for Delivery' => ['Completed'],
    _ => [],
  };
}

bool isOrderAdmin(String role) => role == 'owner' || role == 'admin';

/// The status buttons an owner/admin gets on an order (same list as the website's order panel). Nobody on staff
/// rejects orders; a prepaid order cannot be confirmed or completed before its payment is verified.
List<String> adminStatusActions({
  required String status,
  required String orderType,
  required String paymentMethod,
  required String paymentStatus,
}) {
  final unpaid = paymentMethod != 'cod' && paymentStatus != 'verified';
  final base = nextStatuses(status, orderType)
      .where((s) => s != 'Rejected')
      .where((s) => !(s == 'Confirmed' && unpaid))
      .toList();
  if (!terminalStatuses.contains(status)) {
    for (final s in ['Completed', 'Cancelled']) {
      if (!base.contains(s) && !(s == 'Completed' && unpaid)) base.add(s);
    }
  }
  return base;
}

/// The four stops on the rider track (same as src/lib/orderProgress.js).
List<String> trackLabels(String orderType) => ['Confirmed', 'Cooking', orderType == 'pickup' ? 'Ready to pick' : 'Ready to go', 'Completed'];

/// -1 while the shop has not confirmed yet, then 0..3.
int trackStage(String status) => const {'Confirmed': 0, 'Cooking': 1, 'Ready for Pickup': 2, 'Out for Delivery': 2, 'Completed': 3}[status] ?? -1;

/// '12:05' or '1:02:00'; '0:00' once the time has passed.
String countdownText(Duration left) {
  final s = left.inMilliseconds <= 0 ? 0 : (left.inMilliseconds / 1000).ceil();
  String two(int n) => n.toString().padLeft(2, '0');
  final h = s ~/ 3600, m = (s % 3600) ~/ 60;
  return h > 0 ? '$h:${two(m)}:${two(s % 60)}' : '$m:${two(s % 60)}';
}

/// A transfer the shop has not confirmed yet, on an order that is still running.
bool paymentUnconfirmed(String paymentMethod, String paymentStatus, String status) =>
    paymentMethod != 'cod' && !terminalStatuses.contains(status) && const ['pending', 'rejected', 'submitted'].contains(paymentStatus);

/// Steps shown on the customer's progress timeline.
List<String> timelineSteps(String orderType, String paymentMethod) => [
      'Placed',
      if (paymentMethod != 'cod') 'Payment Verification',
      'Confirmed',
      'Cooking',
      orderType == 'pickup' ? 'Ready for Pickup' : 'Out for Delivery',
      'Completed',
    ];
