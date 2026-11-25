import 'dart:async';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../state/auth_state.dart';
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import '../staff_api.dart';

// Shared pieces of the owner/admin screens.

/// Loads a request (or a few side by side) and shows it: the last answer appears at once, fresh data replaces it,
/// pull down to reload, and a lost connection keeps the old data on screen with a note instead of an error page.
class Loaded extends StatefulWidget {
  const Loaded(this.path, {super.key, this.query, this.also = const [], required this.builder});

  final String path;
  final Map<String, String>? query;

  /// More requests whose answers are merged into the same map (their keys differ).
  final List<String> also;

  /// The children of a scrolling page. `reload` fetches again after a change.
  final List<Widget> Function(BuildContext context, Map<String, dynamic> data, Future<void> Function() reload) builder;

  @override
  State<Loaded> createState() => LoadedState();
}

class LoadedState extends State<Loaded> {
  Map<String, dynamic>? _data;
  String? _error;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _data = _peek();
    reload();
  }

  Map<String, dynamic>? _peek() {
    final api = StaffApi.of(context);
    final parts = [api.peek(widget.path, query: widget.query), for (final p in widget.also) api.peek(p)];
    return parts.contains(null) ? null : {for (final p in parts) ...p!};
  }

  @override
  void didUpdateWidget(Loaded oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.path != widget.path || '${oldWidget.query}' != '${widget.query}') {
      _data = _peek();
      _error = null;
      reload();
    }
  }

  Future<void> reload() async {
    // Only the newest answer counts: a slow older one must not overwrite it.
    final request = ++_request;
    try {
      final api = StaffApi.of(context);
      final parts = await Future.wait([api.get(widget.path, query: widget.query), for (final p in widget.also) api.get(p)]);
      if (mounted && request == _request) {
        setState(() {
          _data = {for (final p in parts) ...p};
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    if (data == null) {
      return _error == null
          ? const Center(child: CircularProgressIndicator())
          : EmptyState(icon: Icons.wifi_off, title: 'Could not load this', message: _error, action: FilledButton(onPressed: reload, child: const Text('Try again')));
    }
    return RefreshIndicator(
      onRefresh: reload,
      child: Narrow(
        maxWidth: 760,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (_error != null) ...[
              Notice('$_error Showing what was loaded before; pull down to try again.', kind: NoticeKind.warning),
              const SizedBox(height: 10),
            ],
            ...widget.builder(context, data, reload),
          ],
        ),
      ),
    );
  }
}

/// A page of its own, for a section opened from "More".
class AdminPage extends StatelessWidget {
  const AdminPage({super.key, required this.title, required this.child, this.floating});

  final String title;
  final Widget child;
  final Widget? floating;

  @override
  Widget build(BuildContext context) {
    // Signing out, or an expired session, leaves nothing to show.
    final signedOut = context.watch<StaffState>().user == null;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      floatingActionButton: signedOut ? null : floating,
      body: signedOut ? const EmptyState(icon: Icons.lock_outline, title: 'Please sign in again') : child,
    );
  }
}

/// Runs a change on the server and says how it went. Returns whether it worked.
Future<bool> act(BuildContext context, Future<Object?> Function(StaffApi api) change, {String? done}) async {
  final messenger = ScaffoldMessenger.of(context);
  void say(String text, {bool bad = false}) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), backgroundColor: bad ? Brand.red : null, duration: Duration(seconds: bad ? 6 : 3)));
  try {
    await change(StaffApi.of(context));
    if (done != null) say(done);
    return true;
  } on ApiException catch (e) {
    say(e.message, bad: true);
    return false;
  }
}

void fail(BuildContext context, String message) => ScaffoldMessenger.of(context)
  ..hideCurrentSnackBar()
  ..showSnackBar(SnackBar(content: Text(message), backgroundColor: Brand.red, duration: const Duration(seconds: 6)));

/// Saves bytes where the person chooses. Replaced in tests.
Future<bool> Function(String name, Uint8List bytes) saveBytes =
    (name, bytes) async => await FilePicker.saveFile(fileName: name, bytes: bytes) != null;

/// Downloads a file from the website and offers to save it.
Future<void> downloadAndSave(BuildContext context, String path, {Map<String, String>? query, required String fallbackName}) async {
  final messenger = ScaffoldMessenger.of(context);
  void say(String text, {bool bad = false}) => messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), backgroundColor: bad ? Brand.red : null));
  say('Preparing the file…');
  try {
    final (bytes, name) = await StaffApi.of(context).download(path, query: query, fallbackName: fallbackName);
    if (await saveBytes(name, bytes)) say('Saved $name');
  } on ApiException catch (e) {
    say(e.message, bad: true);
  } catch (_) {
    say('The file could not be saved on this phone.', bad: true);
  }
}

/// Picks a photo for a product or deal and uploads it; returns its address on the website, or null.
Future<String?> pickAndUploadImage(BuildContext context) async {
  final api = StaffApi.of(context);
  try {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1600, maxHeight: 1600, imageQuality: 82);
    if (picked == null) return null;
    final bytes = await picked.readAsBytes();
    final r = await api.upload('/api/admin/upload', bytes, filename: 'photo', type: ApiClient.imageType(bytes));
    return '${r['url']}';
  } on ApiException catch (e) {
    if (context.mounted) fail(context, e.message);
  } catch (_) {
    if (context.mounted) fail(context, 'Could not read that picture.');
  }
  return null;
}

// ---- Shop time (Pakistan, UTC+5, no daylight saving), whatever the phone's own time zone is.

const _offset = Duration(hours: 5);

/// 'yyyy-mm-dd' of a wall-clock date.
String ymd(DateTime d) => '${d.year}-${'${d.month}'.padLeft(2, '0')}-${'${d.day}'.padLeft(2, '0')}';

/// Today in the shop.
String shopToday([DateTime? now]) => ymd((now ?? DateTime.now()).toUtc().add(_offset));

/// A stored instant as the shop's wall clock.
DateTime shopWall(DateTime instant) => instant.toUtc().add(_offset);

/// The shop's wall clock back to the instant it means.
DateTime fromShopWall(int y, int m, int d, int h, int min) => DateTime.utc(y, m, d, h, min).subtract(_offset);

Future<String?> pickDay(BuildContext context, String current) async {
  final initial = DateTime.tryParse(current) ?? DateTime.now();
  final picked = await showDatePicker(context: context, initialDate: initial, firstDate: DateTime(2024), lastDate: DateTime(initial.year + 3, 12, 31));
  return picked == null ? null : ymd(picked);
}

/// A date-and-time field meaning shop time, with a button to clear it.
class ShopDateTimeField extends StatelessWidget {
  const ShopDateTimeField({super.key, required this.label, required this.value, required this.onChanged});

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;

  Future<void> _pick(BuildContext context) async {
    final wall = shopWall(value ?? DateTime.now());
    final day = await showDatePicker(
      context: context,
      initialDate: DateTime(wall.year, wall.month, wall.day),
      firstDate: DateTime(2024),
      lastDate: DateTime(wall.year + 3, 12, 31),
    );
    if (day == null || !context.mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay(hour: wall.hour, minute: wall.minute));
    if (time == null) return;
    onChanged(fromShopWall(day.year, day.month, day.day, time.hour, time.minute));
  }

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => _pick(context),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: value == null
                ? const Icon(Icons.event, size: 18)
                : IconButton(tooltip: 'Clear', icon: const Icon(Icons.close, size: 18), onPressed: () => onChanged(null)),
          ),
          child: Text(value == null ? 'Not set' : when(value), style: TextStyle(color: value == null ? Brand.muted : Brand.ink)),
        ),
      );
}

/// A labelled button showing a day, e.g. "From: 2026-11-01".
class DayButton extends StatelessWidget {
  const DayButton({super.key, required this.label, required this.value, required this.onChanged, this.clearable = true});

  final String label;
  final String value;
  final ValueChanged<String> onChanged;
  final bool clearable;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: () async {
          final day = await pickDay(context, value);
          if (day != null) onChanged(day);
        },
        onLongPress: clearable && value.isNotEmpty ? () => onChanged('') : null,
        icon: const Icon(Icons.event, size: 17),
        label: Text('$label: ${value.isEmpty ? 'any' : value}'),
      );
}

// ---- Small shared widgets

/// A text box with its label above, the way the website's forms look.
class Field extends StatelessWidget {
  const Field(this.label, this.controller, {super.key, this.number = false, this.lines = 1, this.hint, this.max, this.helper, this.onChanged, this.keyboard});

  final String label;
  final TextEditingController controller;
  final bool number;
  final int lines;
  final String? hint;
  final String? helper;
  final int? max;
  final ValueChanged<String>? onChanged;
  final TextInputType? keyboard;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: controller,
          keyboardType: keyboard ?? (number ? const TextInputType.numberWithOptions(decimal: true, signed: true) : (lines > 1 ? TextInputType.multiline : null)),
          minLines: lines,
          maxLines: lines == 1 ? 1 : lines + 2,
          maxLength: max,
          onChanged: onChanged,
          decoration: InputDecoration(labelText: label, hintText: hint, helperText: helper, helperMaxLines: 3, counterText: ''),
        ),
      );
}

class SwitchRow extends StatelessWidget {
  const SwitchRow(this.label, this.value, this.onChanged, {super.key, this.hint});

  final String label;
  final String? hint;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
        contentPadding: EdgeInsets.zero,
        dense: true,
        title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: hint == null ? null : Text(hint!),
        value: value,
        onChanged: onChanged,
      );
}

/// Space between panels in an admin page.
class Gap extends StatelessWidget {
  const Gap({super.key, this.height = 10});

  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(height: height);
}

class Muted extends StatelessWidget {
  const Muted(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(text, style: const TextStyle(color: Brand.muted, fontSize: 12, height: 1.35));
}

/// A number with its label, as on the website's dashboard.
class StatCard extends StatelessWidget {
  const StatCard(this.label, this.value, {super.key, this.hint, this.color});

  final String label;
  final String value;
  final String? hint;
  final Color? color;

  @override
  Widget build(BuildContext context) => Panel(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: const TextStyle(color: Brand.muted, fontSize: 11.5)),
            const SizedBox(height: 2),
            FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color))),
            if (hint != null) Text(hint!, style: const TextStyle(color: Brand.muted, fontSize: 10.5)),
          ],
        ),
      );
}

/// Two stat cards to a row.
class StatGrid extends StatelessWidget {
  const StatGrid(this.cards, {super.key});

  final List<StatCard> cards;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < cards.length; i += 2)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: cards[i]),
                    const SizedBox(width: 8),
                    Expanded(child: i + 1 < cards.length ? cards[i + 1] : const SizedBox.shrink()),
                  ],
                ),
              ),
            ),
        ],
      );
}

/// Label, amount and a bar proportional to the largest.
class Bars extends StatelessWidget {
  const Bars(this.rows, {super.key, this.format, this.empty = 'No data for this period.'});

  final List<(String, num)> rows;
  final String Function(num)? format;
  final String empty;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return Muted(empty);
    final max = rows.fold<num>(1, (m, r) => r.$2 > m ? r.$2 : m);
    return Column(
      children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(label, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5))),
                    Text(format?.call(value) ?? '$value', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 3),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(value: (value / max).clamp(0, 1).toDouble(), minHeight: 6, color: Brand.red, backgroundColor: const Color(0xFFF4F4F5)),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// "Previous / Page x of y / Next".
class Pager extends StatelessWidget {
  const Pager({super.key, required this.page, required this.pages, required this.onPage});

  final int page;
  final int pages;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) => pages <= 1
      ? const SizedBox.shrink()
      : Wrap(
          alignment: WrapAlignment.center,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton(onPressed: page <= 1 ? null : () => onPage(page - 1), child: const Text('Previous')),
            Text('Page $page of $pages'),
            TextButton(onPressed: page >= pages ? null : () => onPage(page + 1), child: const Text('Next')),
          ],
        );
}
