import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../theme.dart';

/// Saves a file where the person chooses. Returns false if they cancelled.
typedef SaveFile = Future<bool> Function(String name, Uint8List bytes);

Future<bool> _systemSave(String name, Uint8List bytes) async =>
    await FilePicker.saveFile(fileName: name, bytes: bytes, mimeType: 'application/pdf') != null;

enum _State { idle, loading, saved, failed }

/// "Download Menu (PDF)": the same published menu the website gives (the shop's own PDF, or one made from the live
/// menu). Shows what is happening: preparing, saved, or why it failed.
class MenuPdfButton extends StatefulWidget {
  const MenuPdfButton({super.key, this.asTile = false, this.save = _systemSave});

  /// A row for a list (the More screen) instead of a button.
  final bool asTile;
  final SaveFile save;

  @override
  State<MenuPdfButton> createState() => _MenuPdfButtonState();
}

class _MenuPdfButtonState extends State<MenuPdfButton> {
  _State _state = _State.idle;
  String _error = '';
  Timer? _reset;

  @override
  void dispose() {
    _reset?.cancel();
    super.dispose();
  }

  void _set(_State state, [String error = '']) {
    if (!mounted) return;
    setState(() {
      _state = state;
      _error = error;
    });
  }

  Future<void> _download() async {
    if (_state == _State.loading) return;
    _reset?.cancel();
    _set(_State.loading);
    try {
      final (bytes, name) = await context.read<ApiClient>().downloadMenuPdf();
      if (!await widget.save(name, bytes)) return _set(_State.idle);
      _set(_State.saved);
      _reset = Timer(const Duration(seconds: 5), () => _set(_State.idle));
    } on ApiException catch (e) {
      _set(_State.failed, e.message);
    } catch (_) {
      _set(_State.failed, 'The menu could not be saved on this phone.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = switch (_state) {
      _State.loading => 'Preparing menu…',
      _State.saved => 'Menu saved',
      _ => 'Download Menu (PDF)',
    };
    final icon = switch (_state) {
      _State.loading => const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2)),
      _State.saved => const Icon(Icons.check_circle, size: 18, color: Brand.green),
      _ => const Icon(Icons.picture_as_pdf_outlined, size: 18, color: Brand.red),
    };
    final onTap = _state == _State.loading ? null : _download;
    final error = _state == _State.failed ? '$_error Tap to try again.' : null;

    if (widget.asTile) {
      return ListTile(
        leading: icon,
        title: Text(label),
        subtitle: error == null ? null : Text(error, style: const TextStyle(color: Brand.red)),
        trailing: const Icon(Icons.download, color: Brand.muted),
        onTap: onTap,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(backgroundColor: Colors.white, minimumSize: const Size.fromHeight(42)),
          onPressed: onTap,
          icon: icon,
          label: Text(label),
        ),
        if (error != null)
          Semantics(
            liveRegion: true,
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(error, textAlign: TextAlign.center, style: const TextStyle(color: Brand.red, fontSize: 12)),
            ),
          ),
      ],
    );
  }
}
