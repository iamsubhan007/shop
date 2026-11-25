import 'dart:async';
import 'dart:math';

import 'package:material_ui/material_ui.dart';

import '../models/order.dart';
import '../theme.dart';
import '../utils/order_status.dart';

/// The countdown the shop set, large and centred, with a delivery rider who moves along as the order moves on:
/// Confirmed -> Cooking -> Ready to go / pick -> Completed.
class OrderProgressHero extends StatefulWidget {
  const OrderProgressHero({super.key, required this.order, this.now});

  final Order order;

  /// Replaced in tests.
  final DateTime Function()? now;

  @override
  State<OrderProgressHero> createState() => _OrderProgressHeroState();
}

class _OrderProgressHeroState extends State<OrderProgressHero> with SingleTickerProviderStateMixin {
  late final AnimationController _motion = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _run();
  }

  @override
  void didUpdateWidget(OrderProgressHero old) {
    super.didUpdateWidget(old);
    _run();
  }

  /// The rider only bounces while there is somewhere to go, and not for people who turned animations off.
  void _run() {
    final stage = trackStage(widget.order.status);
    final move = stage >= 0 && stage < 3 && !MediaQuery.disableAnimationsOf(context);
    if (move && !_motion.isAnimating) _motion.repeat();
    if (!move && _motion.isAnimating) _motion.stop();
  }

  @override
  void dispose() {
    _tick?.cancel();
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final stage = trackStage(order.status);
    final done = stage == 3;
    final left = order.etaAt!.difference((widget.now ?? DateTime.now)());
    final late = !done && left.inMilliseconds <= 0;
    final (ring, fill) = done
        ? (Brand.green, Brand.greenSoft)
        : late
            ? (const Color(0xFFF87171), Brand.redSoft)
            : (const Color(0xFFFBBF24), Brand.amberSoft);
    final message = done
        ? 'Enjoy your meal!'
        : stage < 0
            ? 'Waiting for the shop to confirm your order.'
            : late
                ? 'It is taking a little longer than planned. Thank you for your patience.'
                : 'About ${(left.inMilliseconds / 60000).ceil()} min left.';

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 18),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFFFDE68A))),
      child: Column(
        children: [
          Container(
            width: 176,
            height: 176,
            alignment: Alignment.center,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(shape: BoxShape.circle, color: fill, border: Border.all(color: ring, width: 10)),
            child: FittedBox(
              child: done
                  ? Text('${order.isDelivery ? 'Delivered' : 'Picked up'} ✓', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Brand.greenInk))
                  : late
                      ? const Text('Almost there', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Brand.red))
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(countdownText(left), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, fontFeatures: [FontFeature.tabularFigures()])),
                            Text(order.isDelivery ? 'until it is with you' : 'until it is ready', style: const TextStyle(fontSize: 12, color: Brand.muted)),
                          ],
                        ),
            ),
          ),
          const SizedBox(height: 14),
          Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Brand.inkSoft, fontSize: 13)),
          const SizedBox(height: 18),
          _track(stage, done),
          const SizedBox(height: 6),
          Row(
            children: [
              for (final (i, label) in trackLabels(order.type).indexed)
                Expanded(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: i == stage ? Brand.red : (i < stage ? Brand.green : Brand.muted),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  /// A line with the rider on it. The four stops sit over the middle of the four labels below.
  Widget _track(int stage, bool done) => LayoutBuilder(
        builder: (context, box) {
          final step = box.maxWidth / 4;
          final first = step / 2;
          return Semantics(
            label: 'Order stage: ${stage < 0 ? 'not confirmed yet' : trackLabels(widget.order.type)[stage]}',
            child: SizedBox(
              height: 52,
              child: TweenAnimationBuilder<double>(
                tween: Tween(end: max(0, stage).toDouble()),
                duration: const Duration(milliseconds: 1200),
                curve: Curves.easeInOut,
                builder: (context, at, _) => Stack(
                  children: [
                    Positioned(left: first, right: first, bottom: 2, child: _bar(const Color(0xFFE4E4E7))),
                    Positioned(left: first, width: at * step, bottom: 2, child: _bar(Brand.green)),
                    Positioned(
                      left: first + at * step - 28,
                      bottom: 6,
                      child: Opacity(
                        key: const ValueKey('rider'),
                        opacity: stage < 0 ? 0.35 : 1,
                        child: AnimatedBuilder(
                          animation: _motion,
                          builder: (context, _) => CustomPaint(size: const Size(56, 42), painter: RiderPainter(done ? 0 : _motion.value)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );

  Widget _bar(Color color) => Container(height: 6, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(3)));
}

/// A delivery rider on a scooter, facing right. [t] runs 0..1 to turn the wheels and bounce the rider.
class RiderPainter extends CustomPainter {
  RiderPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 64, size.height / 48);
    Paint line(Color c, double w) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    Paint fill(Color c) => Paint()..color = c;

    canvas.save();
    canvas.translate(0, -sin(t * 2 * pi).abs() * 2);
    canvas.drawRRect(RRect.fromLTRBR(4, 14, 21, 29, const Radius.circular(3)), fill(Brand.red));
    canvas.drawLine(const Offset(8, 18), const Offset(17, 18), line(const Color(0xFFFECACA), 1.6));
    canvas.drawLine(const Offset(8, 22), const Offset(17, 22), line(const Color(0xFFFECACA), 1.6));
    canvas.drawPath(Path()..moveTo(16, 33)..lineTo(38, 33)..lineTo(44, 23)..lineTo(51, 23), line(const Color(0xFF27272A), 4));
    canvas.drawLine(const Offset(49, 22), const Offset(54, 37), line(const Color(0xFF27272A), 3));
    canvas.drawPath(Path()..moveTo(27, 31)..lineTo(25, 20)..lineTo(35, 17)..lineTo(39, 26)..lineTo(47, 27), line(const Color(0xFFF59E0B), 5));
    canvas.drawCircle(const Offset(34, 9), 6, fill(Brand.red));
    canvas.drawLine(const Offset(34, 8), const Offset(40, 8), line(const Color(0xFFFEF3C7), 2.4));
    canvas.restore();

    for (final x in [15.0, 53.0]) {
      final centre = Offset(x, 38);
      canvas.drawCircle(centre, 7, line(const Color(0xFF18181B), 3));
      for (final a in [t * 2 * pi, t * 2 * pi + pi / 2]) {
        final d = Offset(cos(a), sin(a)) * 5;
        canvas.drawLine(centre - d, centre + d, line(const Color(0xFF71717A), 1.4));
      }
    }
  }

  @override
  bool shouldRepaint(RiderPainter old) => old.t != t;
}
