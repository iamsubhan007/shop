import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:http_parser/http_parser.dart';
import 'package:material_ui/material_ui.dart';

import '../../api/api_client.dart';
import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import '../staff_api.dart';
import 'admin_common.dart';

const _maxPdfBytes = 10 * 1024 * 1024;

String _size(num n) => n >= 1024 * 1024 ? '${(n / 1024 / 1024).toStringAsFixed(1)} MB' : '${(n / 1024).ceil()} KB';

/// Which menu PDF customers download: the automatic one, or an uploaded file.
class MenuPdfAdminScreen extends StatefulWidget {
  const MenuPdfAdminScreen({super.key});

  @override
  State<MenuPdfAdminScreen> createState() => _MenuPdfAdminScreenState();
}

class _MenuPdfAdminScreenState extends State<MenuPdfAdminScreen> {
  final _loaded = GlobalKey<LoadedState>();
  (String, Uint8List)? _picked;
  bool _busy = false;

  Future<void> _reload() async => _loaded.currentState?.reload();

  Future<void> _change(Future<Object?> Function(StaffApi api) change, String done) async {
    setState(() => _busy = true);
    await act(context, change, done: done);
    await _reload();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _choose() async {
    try {
      final file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf']);
      if (file == null || !mounted) return;
      final bytes = await file.readAsBytes();
      if (!mounted) return;
      if (bytes.length > _maxPdfBytes) return fail(context, 'The PDF is too large (the most allowed is 10 MB).');
      if (bytes.length < 5 || String.fromCharCodes(bytes.sublist(0, 5)) != '%PDF-') return fail(context, 'That file is not a PDF.');
      setState(() => _picked = (file.name, bytes));
    } catch (_) {
      if (mounted) fail(context, 'Could not open that file.');
    }
  }

  Future<void> _upload(bool publish, num directAbove) async {
    final (name, bytes) = _picked!;
    if (publish && !await confirm(context, 'Publish "$name"? Every customer will download this PDF from the website and the app.', yes: 'Publish', no: 'Back')) return;
    if (!mounted) return;
    await _change((api) async {
      if (directAbove > 0 && bytes.length > directAbove) {
        // Too large to pass through the website: it goes straight to storage through a one-off link.
        final link = await api.post('/api/admin/menu-pdf/direct', {'originalName': name, 'size': bytes.length});
        await api.api.putToStorage(Uri.parse('${link['uploadUrl']}'), bytes, 'application/pdf');
        await api.put('/api/admin/menu-pdf/direct', {'name': link['name'], 'originalName': name, 'activate': publish});
      } else {
        await api.upload('/api/admin/menu-pdf', bytes, filename: name, type: MediaType('application', 'pdf'), fields: {'activate': '$publish'});
      }
      if (mounted) setState(() => _picked = null);
      return null;
    }, publish ? 'Published. Customers now download your PDF.' : 'Uploaded. It is not published yet.');
  }

  /// The menu customers download right now.
  Future<void> _downloadCurrent() async {
    final api = StaffApi.of(context).api;
    try {
      final (bytes, name) = await api.downloadMenuPdf();
      if (await saveBytes(name, bytes) && mounted) toast(context, 'Saved $name');
    } on ApiException catch (e) {
      if (mounted) fail(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) => AdminPage(
        title: 'Menu PDF',
        child: Loaded(
          '/api/admin/menu-pdf',
          key: _loaded,
          builder: (context, data, reload) {
            final files = maps(data['files']);
            final custom = data['source'] == 'custom';
            final active = files.where((f) => f['active'] == true).firstOrNull;
            final auto = data['auto'] is Map ? data['auto'] as Map : const {};
            final uploads = data['storage'] != 'unavailable';
            return [
              const Muted('The "Download Menu (PDF)" button on the website and in the app gives customers the menu chosen here.'),
              const Gap(),
              Panel(
                title: 'Customers download now',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(custom ? 'Your PDF: ${active?['original'] ?? ''}' : 'Automatic menu (from your live menu)', style: const TextStyle(fontWeight: FontWeight.w800)),
                    if (data['activeFileMissing'] == true) const Notice('The published file is missing from storage, so customers are getting the automatic menu. Upload it again.', kind: NoticeKind.warning),
                    if (!uploads) const Notice('Uploads are not set up on this server. The automatic menu works.', kind: NoticeKind.warning),
                    const Gap(),
                    OutlinedButton.icon(onPressed: _downloadCurrent, icon: const Icon(Icons.download, size: 18), label: const Text('Download it')),
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Automatic menu',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Muted('Made on each download from what is published now: ${auto['categories'] ?? 0} categories, ${auto['items'] ?? 0} available items, ${auto['deals'] ?? 0} active deals.'),
                    const Gap(),
                    OutlinedButton.icon(
                      onPressed: () => downloadAndSave(context, '/api/admin/menu-pdf/preview', fallbackName: 'menu-preview.pdf'),
                      icon: const Icon(Icons.visibility_outlined, size: 18),
                      label: const Text('Preview automatic menu'),
                    ),
                    if (custom) ...[
                      const Gap(height: 6),
                      FilledButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                if (await confirm(context, 'Switch to the automatically generated menu? Your uploaded PDFs are kept.', yes: 'Switch', no: 'Back')) {
                                  await _change((api) => api.patch('/api/admin/menu-pdf', {'action': 'automatic'}), 'Customers now download the automatic menu.');
                                }
                              },
                        child: const Text('Use automatic menu'),
                      ),
                    ],
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Your own PDF',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Muted('Up to 10 MB. It only changes what customers download: menu items and prices stay as they are, so keep the two in agreement.'),
                    const Gap(),
                    OutlinedButton.icon(onPressed: _busy || !uploads ? null : _choose, icon: const Icon(Icons.attach_file, size: 18), label: const Text('Choose a PDF')),
                    if (_picked != null) ...[
                      const Gap(height: 6),
                      Text('${_picked!.$1} (${_size(_picked!.$2.length)}) — not uploaded yet', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      const Gap(height: 6),
                      BusyButton(busy: _busy, onPressed: () => _upload(true, asNum(data['directUploadAbove'])), label: 'Upload and publish'),
                      const Gap(height: 6),
                      OutlinedButton(onPressed: _busy ? null : () => _upload(false, asNum(data['directUploadAbove'])), child: const Text('Upload only')),
                      TextButton(onPressed: _busy ? null : () => setState(() => _picked = null), child: const Text('Cancel')),
                    ],
                  ],
                ),
              ),
              const Gap(),
              Panel(
                title: 'Uploaded PDFs',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (files.isEmpty) const Muted('None yet.'),
                    for (final f in files) ...[
                      Text('${f['original']}${f['active'] == true ? '  ✓ published' : ''}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      Muted('${_size(asNum(f['size']))} · ${when(parseDate(f['uploadedAt']))} · ${f['uploadedBy'] ?? ''}'),
                      Wrap(
                        spacing: 6,
                        children: [
                          TextButton(
                            onPressed: () => downloadAndSave(context, '/api/admin/menu-pdf/files/${f['id']}', fallbackName: '${f['original']}'),
                            child: const Text('Preview'),
                          ),
                          if (f['active'] == true)
                            TextButton(
                              onPressed: _busy ? null : () => _change((api) => api.patch('/api/admin/menu-pdf', {'action': 'automatic'}), 'Unpublished. Customers now download the automatic menu.'),
                              child: const Text('Unpublish'),
                            )
                          else ...[
                            TextButton(
                              onPressed: _busy
                                  ? null
                                  : () async {
                                      if (await confirm(context, 'Publish "${f['original']}"? Every customer will download this PDF.', yes: 'Publish', no: 'Back')) {
                                        await _change((api) => api.patch('/api/admin/menu-pdf', {'action': 'activate', 'id': f['id']}), 'Published. Customers now download your PDF.');
                                      }
                                    },
                              child: const Text('Publish'),
                            ),
                            TextButton(
                              style: TextButton.styleFrom(foregroundColor: Brand.red),
                              onPressed: _busy
                                  ? null
                                  : () async {
                                      if (await confirm(context, 'Permanently delete "${f['original']}"?', yes: 'Delete', no: 'Keep it', danger: true)) {
                                        await _change((api) => api.delete('/api/admin/menu-pdf/files/${f['id']}'), 'Deleted.');
                                      }
                                    },
                              child: const Text('Delete'),
                            ),
                          ],
                        ],
                      ),
                    ],
                    const Muted('The latest 5 uploads are kept.'),
                  ],
                ),
              ),
            ];
          },
        ),
      );
}
