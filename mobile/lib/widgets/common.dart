import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';
import '../utils/format.dart';

/// White rounded panel, like the website's cards.
class Panel extends StatelessWidget {
  const Panel({super.key, this.title, required this.child, this.padding = const EdgeInsets.all(16), this.borderColor});

  final String? title;
  final Widget child;
  final EdgeInsets padding;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: borderColor ?? Brand.line),
        ),
        child: Padding(
          padding: padding,
          // Without a title the child gets the panel's own size limits (a menu card must know its height).
          child: title == null
              ? child
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 10),
                    child,
                  ],
                ),
        ),
      );
}

enum NoticeKind { error, warning, success, info }

class Notice extends StatelessWidget {
  const Notice(this.text, {super.key, this.kind = NoticeKind.error, this.icon, this.action});

  final String text;
  final NoticeKind kind;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, fallback) = switch (kind) {
      NoticeKind.error => (Brand.redSoft, Brand.red, Icons.error_outline),
      NoticeKind.warning => (Brand.amberSoft, Brand.amberInk, Icons.warning_amber_rounded),
      NoticeKind.success => (Brand.greenSoft, Brand.greenInk, Icons.check_circle_outline),
      NoticeKind.info => (const Color(0xFFF4F4F5), Brand.inkSoft, Icons.info_outline),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: fg.withValues(alpha: 0.25)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon ?? fallback, size: 18, color: fg),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: TextStyle(color: fg, fontSize: 13, height: 1.35))),
            ?action,
          ],
        ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'Completed' => (const Color(0xFFD1FAE5), Brand.greenInk),
      'Cancelled' => (Brand.line, const Color(0xFF3F3F46)),
      'Rejected' => (const Color(0xFFFEE2E2), const Color(0xFF991B1B)),
      _ => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(status, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }
}

/// A button that shows a spinner and cannot be tapped twice while its action runs.
class BusyButton extends StatelessWidget {
  const BusyButton({super.key, required this.busy, required this.onPressed, required this.label, this.icon, this.color});

  final bool busy;
  final VoidCallback? onPressed;
  final String label;
  final IconData? icon;
  final Color? color;

  @override
  Widget build(BuildContext context) => FilledButton(
        style: color == null ? null : FilledButton.styleFrom(backgroundColor: color),
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
            : Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                  Flexible(child: Text(label, textAlign: TextAlign.center)),
                ],
              ),
      );
}

class QuantityStepper extends StatelessWidget {
  const QuantityStepper({super.key, required this.value, required this.onChanged, this.min = 1, this.max = 50});

  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton.outlined(
            tooltip: 'Less',
            visualDensity: VisualDensity.compact,
            onPressed: value > min ? () => onChanged(value - 1) : null,
            icon: const Icon(Icons.remove, size: 18),
          ),
          SizedBox(
            width: 34,
            child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800)),
          ),
          IconButton.outlined(
            tooltip: 'More',
            visualDensity: VisualDensity.compact,
            onPressed: value < max ? () => onChanged(value + 1) : null,
            icon: const Icon(Icons.add, size: 18),
          ),
        ],
      );
}

class AmountRow extends StatelessWidget {
  const AmountRow(this.label, this.value, {super.key, this.bold = false, this.color});

  final String label;
  final String value;
  final bool bold;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: bold ? 17 : 13.5,
      fontWeight: bold ? FontWeight.w900 : FontWeight.w400,
      color: color,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style.copyWith(color: color ?? (bold ? null : Brand.muted)))),
          Text(value, style: style),
        ],
      ),
    );
  }
}

/// The money block under a list of order items.
class BillSummary extends StatelessWidget {
  const BillSummary({super.key, required this.subtotal, required this.discount, required this.deliveryFee, required this.total});

  final num subtotal;
  final num discount;
  final num deliveryFee;
  final num total;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          AmountRow('Subtotal', rs(subtotal)),
          if (discount > 0) AmountRow('Discount', '- ${rs(discount)}', color: Brand.green),
          if (deliveryFee > 0) AmountRow('Delivery', rs(deliveryFee)),
          AmountRow('Total', rs(total), bold: true),
        ],
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 46, color: Brand.muted),
              const SizedBox(height: 14),
              Text(title, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 13)),
              ],
              if (action != null) ...[const SizedBox(height: 18), action!],
            ],
          ),
        ),
      );
}

/// Keeps forms and lists readable on tablets.
class Narrow extends StatelessWidget {
  const Narrow({super.key, required this.child, this.maxWidth = 640});

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
      );
}

void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 3)));
}

Future<bool> confirm(BuildContext context, String message, {String yes = 'Yes', String no = 'No', bool danger = false}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(no)),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: Brand.red) : null,
          onPressed: () => Navigator.pop(context, true),
          child: Text(yes),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Opens a web page, phone dialler, WhatsApp or the maps app.
Future<void> openLink(BuildContext context, Uri uri, {bool inApp = false}) async {
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: inApp ? LaunchMode.inAppBrowserView : LaunchMode.externalApplication);
  } catch (_) {}
  if (!ok && context.mounted) toast(context, 'Could not open that on this phone.');
}

Uri whatsappLink(String number, String text) =>
    Uri.https('wa.me', number.isEmpty ? '/' : '/${whatsappNumber(number)}', {'text': text});

Uri directionsLink(double lat, double lng) =>
    Uri.https('www.google.com', '/maps/dir/', {'api': '1', 'destination': '$lat,$lng'});
