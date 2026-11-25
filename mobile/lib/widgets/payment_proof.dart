import 'package:material_ui/material_ui.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../theme.dart';

/// Pick a payment screenshot from the phone and upload it. The picker shrinks it first (like the website does),
/// so it uploads quickly on mobile data and stays under the host's request size limit.
class ProofPicker extends StatefulWidget {
  const ProofPicker({super.key, required this.fileName, required this.onUploaded, required this.onError, this.onBusy});

  /// The server's name for the uploaded file, once there is one.
  final String? fileName;
  final ValueChanged<String> onUploaded;
  final ValueChanged<String> onError;
  final ValueChanged<bool>? onBusy;

  @override
  State<ProofPicker> createState() => _ProofPickerState();
}

class _ProofPickerState extends State<ProofPicker> {
  bool _busy = false;

  void _setBusy(bool value) {
    widget.onBusy?.call(value);
    if (mounted) setState(() => _busy = value);
  }

  Future<void> _pick() async {
    final api = context.read<ApiClient>();
    try {
      final picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, maxHeight: 1600, imageQuality: 82);
      if (picked == null || !mounted) return;
      _setBusy(true);
      final bytes = await picked.readAsBytes();
      final r = await api.uploadImage('/api/upload/proof', bytes, filename: 'payment-proof');
      widget.onUploaded('${r['file']}');
    } on ApiException catch (e) {
      widget.onError(e.message);
    } catch (_) {
      widget.onError('Could not read that picture. You can enter the transaction ID instead.');
    } finally {
      _setBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final attached = widget.fileName != null;
    return OutlinedButton.icon(
      onPressed: _busy ? null : _pick,
      icon: _busy
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(attached ? Icons.check_circle : Icons.upload_file, size: 18, color: attached ? Brand.green : null),
      label: Text(_busy ? 'Uploading…' : (attached ? 'Screenshot attached (tap to change)' : 'Upload payment screenshot')),
    );
  }
}
