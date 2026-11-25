import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

/// The new-order alarm: a looping sound and vibration until [stop].
abstract class Alarm {
  Future<void> start();
  Future<void> stop();
  void dispose();
}

class SoundAlarm implements Alarm {
  AudioPlayer? _player;
  Timer? _buzz;
  bool _ringing = false;

  @override
  Future<void> start() async {
    if (_ringing) return;
    _ringing = true;
    HapticFeedback.vibrate();
    _buzz = Timer.periodic(const Duration(milliseconds: 2200), (_) => HapticFeedback.vibrate());
    try {
      final player = _player ??= AudioPlayer();
      await player.setAudioContext(AudioContext(
        // The alarm volume on Android, and audible with the silent switch on for iPhone.
        android: const AudioContextAndroid(
          usageType: AndroidUsageType.alarm,
          contentType: AndroidContentType.sonification,
          audioFocus: AndroidAudioFocus.gainTransient,
        ),
        iOS: AudioContextIOS(category: AVAudioSessionCategory.playback),
      ));
      await player.setReleaseMode(ReleaseMode.loop);
      if (_ringing) await player.play(AssetSource('sounds/alarm.wav'));
    } catch (_) {
      // Without sound the banner and vibration still show the order.
    }
  }

  @override
  Future<void> stop() async {
    if (!_ringing) return;
    _ringing = false;
    _buzz?.cancel();
    try {
      await _player?.stop();
    } catch (_) {}
  }

  @override
  void dispose() {
    _ringing = false;
    _buzz?.cancel();
    _player?.dispose();
    _player = null;
  }
}
