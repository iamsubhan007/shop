import 'dart:async';

import 'package:flutter/widgets.dart';

/// Runs [task] now and then every [every]. Pauses while the app is in the background (unless told not to) and
/// runs again as soon as the app comes back. A slow request is never overlapped by the next one.
class Poller {
  Poller(this.every, this.task, {this.keepInBackground = false}) {
    _lifecycle = AppLifecycleListener(
      onHide: () {
        if (!keepInBackground) _timer?.cancel();
      },
      onShow: () {
        now();
        _start();
      },
    );
    now();
    _start();
  }

  final Duration every;
  final Future<void> Function() task;
  final bool keepInBackground;

  late final AppLifecycleListener _lifecycle;
  Timer? _timer;
  bool _busy = false;
  bool _disposed = false;

  void _start() {
    _timer?.cancel();
    if (!_disposed) _timer = Timer.periodic(every, (_) => now());
  }

  Future<void> now() async {
    if (_busy || _disposed) return;
    _busy = true;
    try {
      await task();
    } catch (e, s) {
      FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'poller'));
    } finally {
      _busy = false;
    }
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _lifecycle.dispose();
  }
}
