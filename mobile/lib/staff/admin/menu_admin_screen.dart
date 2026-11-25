import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../../models/menu.dart' show maps;
import '../../theme.dart';
import '../../utils/format.dart';
import '../../widgets/common.dart';
import '../../widgets/net_image.dart';
import 'admin_common.dart';

/// Menu & stock: the same products and categories as the website's admin page.
class MenuAdminScreen extends StatefulWidget {
  const MenuAdminScreen({super.key});

  @override
  State<MenuAdminScreen> createState() => _MenuAdminScreenState();
}

class _MenuAdminScreenState extends State<MenuAdminScreen> {
  final _loaded = GlobalKey<LoadedState>();
  final _search = TextEditingController();
  final _newCategory = TextEditingController();
  String _category = '';
  List<Map<String, dynamic>> _categories = [];

  @override
  void dispose() {
    _search.dispose();
    _newCategory.dispose();
    super.dispose();
  }

  Future<void> _reload() async => _loaded.currentState?.reload();

  Future<void> _edit(Map<String, dynamic>? product) async {
    final saved = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => ProductForm(product: product, categories: _categories)));
    if (saved == true) await _reload();
  }

  Future<void> _patch(String id, Map<String, dynamic> body, String done) async {
    await act(context, (api) => api.patch('/api/admin/products/$id', body), done: done);
    await _reload();
  }

  Future<void> _delete(Map<String, dynamic> p) async {
    if (!await confirm(context, 'Delete "${p['name']}"? Old orders keep their records.', yes: 'Delete', no: 'Keep it', danger: true)) return;
    if (!mounted) return;
    await act(context, (api) => api.delete('/api/admin/products/${p['id']}'), done: 'Deleted');
    await _reload();
  }

  Future<void> _addCategory() async {
    final name = _newCategory.text.trim();
    if (name.isEmpty) return;
    FocusScope.of(context).unfocus();
    if (await act(context, (api) => api.post('/api/admin/categories', {'name': name}), done: 'Category added')) _newCategory.clear();
    await _reload();
  }

  Future<void> _categoryAction(Map<String, dynamic> c, String action) async {
    final hidden = c['isActive'] == false;
    if (action == 'delete') {
      if (!await confirm(context, 'Delete category "${c['name']}"?', yes: 'Delete', no: 'Keep it', danger: true)) return;
    } else if (action == 'visibility' && !hidden) {
      if (!await confirm(context, 'Hide "${c['name']}"? It and its items disappear from the website, the app and the menu PDF.', yes: 'Hide', no: 'Back')) return;
    }
    if (!mounted) return;
    await act(context, (api) {
      final path = '/api/admin/categories/${c['id']}';
      return switch (action) {
        'delete' => api.delete(path),
        'visibility' => api.patch(path, {'isActive': hidden}),
        _ => api.patch(path, {'isPaused': c['isPaused'] != true}),
      };
    });
    await _reload();
  }

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          Loaded('/api/admin/products', key: _loaded, also: const ['/api/admin/categories'], builder: _page),
          Positioned(
            right: 14,
            bottom: 14,
            child: FloatingActionButton.extended(heroTag: 'add-product', onPressed: () => _edit(null), icon: const Icon(Icons.add), label: const Text('Add product')),
          ),
        ],
      );

  List<Widget> _page(BuildContext context, Map<String, dynamic> data, Future<void> Function() reload) {
    final products = maps(data['products']);
    _categories = maps(data['categories']);
    final q = _search.text.trim().toLowerCase();
    final shown = products.where((p) => (_category.isEmpty || p['categoryId'] == _category) && '${p['name']}'.toLowerCase().contains(q)).toList();
    final low = products.where((p) => p['trackStock'] == true && asNum(p['stockQty']) <= asNum(p['lowStockThreshold'])).toList();
    String categoryName(Object? id) => _categories.where((c) => c['id'] == id).map((c) => '${c['name']}').firstOrNull ?? 'No category';

    return [
      if (low.isNotEmpty) ...[
        Notice('Low stock: ${low.map((p) => '${p['name']} (${p['stockQty']})').join(', ')}', kind: NoticeKind.warning),
        const Gap(),
      ],
      Panel(
        title: 'Categories',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in _categories)
                  PopupMenuButton<String>(
                    tooltip: 'Options for ${c['name']}',
                    onSelected: (a) => _categoryAction(c, a),
                    itemBuilder: (_) => [
                      PopupMenuItem(value: 'visibility', child: Text(c['isActive'] == false ? 'Publish (show)' : 'Hide')),
                      PopupMenuItem(value: 'pause', child: Text(c['isPaused'] == true ? 'Resume ordering' : 'Pause ordering')),
                      const PopupMenuItem(value: 'delete', child: Text('Delete')),
                    ],
                    child: Chip(
                      backgroundColor: c['isActive'] == false ? const Color(0xFFF4F4F5) : (c['isPaused'] == true ? Brand.amberSoft : Colors.white),
                      label: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(child: Text('${c['name']}${c['isActive'] == false ? ' (hidden)' : (c['isPaused'] == true ? ' (paused)' : '')}')),
                          const Icon(Icons.arrow_drop_down, size: 18),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const Gap(),
            Row(
              children: [
                Expanded(child: TextField(controller: _newCategory, decoration: const InputDecoration(hintText: 'New category name'))),
                const SizedBox(width: 8),
                OutlinedButton(onPressed: _addCategory, child: const Text('Add')),
              ],
            ),
            const Gap(height: 6),
            const Muted('Pause stops ordering from a category for a while. Hide removes it from the website, the app and the menu PDF until you publish it again.'),
          ],
        ),
      ),
      const Gap(),
      TextField(controller: _search, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Search products', prefixIcon: Icon(Icons.search))),
      const Gap(),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final (id, name) in [('', 'All categories'), ..._categories.map((c) => ('${c['id']}', '${c['name']}'))])
              Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(label: Text(name), selected: _category == id, onSelected: (_) => setState(() => _category = id)),
              ),
          ],
        ),
      ),
      const Gap(),
      if (shown.isEmpty) const Panel(child: Muted('No products found.')),
      for (final p in shown)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Panel(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                InkWell(
                  onTap: () => _edit(p),
                  child: Row(
                    children: [
                      ClipRRect(borderRadius: BorderRadius.circular(8), child: SizedBox(width: 52, height: 52, child: NetImage(p['imageUrl'] as String?, width: 256))),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${p['name']}', style: const TextStyle(fontWeight: FontWeight.w800)),
                            Muted(
                              '${rs(p['price'])}${p['compareAtPrice'] == null ? '' : ' (was ${rs(p['compareAtPrice'])})'} · ${categoryName(p['categoryId'])}'
                              '${p['trackStock'] == true ? ' · stock ${p['stockQty']}' : ''}',
                            ),
                          ],
                        ),
                      ),
                      IconButton(tooltip: 'Edit ${p['name']}', onPressed: () => _edit(p), icon: const Icon(Icons.edit_outlined, size: 19)),
                      IconButton(tooltip: 'Delete ${p['name']}', onPressed: () => _delete(p), icon: const Icon(Icons.delete_outline, size: 19, color: Brand.red)),
                    ],
                  ),
                ),
                Wrap(
                  spacing: 8,
                  children: [
                    FilterChip(
                      label: const Text('Available'),
                      selected: p['isAvailable'] != false,
                      onSelected: (v) => _patch('${p['id']}', {'isAvailable': v}, v ? 'Now available' : 'Now unavailable'),
                    ),
                    FilterChip(
                      label: const Text('Sold out'),
                      selected: p['isSoldOut'] == true,
                      onSelected: (v) => _patch('${p['id']}', {'isSoldOut': v}, v ? 'Marked sold out' : 'Back in stock'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      const Gap(height: 60), // room under the add button
    ];
  }
}

/// Add or edit one product.
class ProductForm extends StatefulWidget {
  const ProductForm({super.key, required this.product, required this.categories});

  /// Null for a new product.
  final Map<String, dynamic>? product;
  final List<Map<String, dynamic>> categories;

  @override
  State<ProductForm> createState() => _ProductFormState();
}

class _ProductFormState extends State<ProductForm> {
  late final Map<String, dynamic> p = widget.product ?? const {};
  late final _name = TextEditingController(text: '${p['name'] ?? ''}');
  late final _description = TextEditingController(text: '${p['description'] ?? ''}');
  late final _price = TextEditingController(text: _num(p['price']));
  late final _oldPrice = TextEditingController(text: _num(p['compareAtPrice']));
  late final _stock = TextEditingController(text: '${p['stockQty'] ?? 0}');
  late final _threshold = TextEditingController(text: '${p['lowStockThreshold'] ?? 5}');
  final _delta = TextEditingController();
  final _reason = TextEditingController();
  late String _category = '${p['categoryId'] ?? ''}';
  late String? _image = p['imageUrl'] as String?;
  late bool _featured = p['isFeatured'] == true;
  late bool _track = p['trackStock'] == true;
  late DateTime? _unavailableUntil = parseDate(p['unavailableUntil']);
  bool _busy = false;

  bool get _isNew => widget.product == null;

  static String _num(Object? v) {
    if (v == null) return '';
    final n = asNum(v);
    return n == n.roundToDouble() ? '${n.round()}' : '$n';
  }

  @override
  void dispose() {
    for (final c in [_name, _description, _price, _oldPrice, _stock, _threshold, _delta, _reason]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final price = num.tryParse(_price.text.trim());
    if (_name.text.trim().length < 2 || price == null) return fail(context, 'Name and price are required.');
    final delta = int.tryParse(_delta.text.trim()) ?? 0;
    if (!_isNew && delta != 0 && _reason.text.trim().length < 2) return fail(context, 'Write a reason for the stock change.');
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'description': _description.text.trim().isEmpty ? null : _description.text.trim(),
      'price': price,
      'compareAtPrice': num.tryParse(_oldPrice.text.trim()),
      'categoryId': _category.isEmpty ? null : _category,
      'imageUrl': _image,
      'isFeatured': _featured,
      'trackStock': _track,
      'lowStockThreshold': int.tryParse(_threshold.text.trim()) ?? 5,
      'unavailableUntil': _unavailableUntil?.toUtc().toIso8601String(),
      if (_isNew) 'stockQty': int.tryParse(_stock.text.trim()) ?? 0,
      if (!_isNew && delta != 0) 'stockAdjust': {'delta': delta, 'reason': _reason.text.trim()},
    };
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    final ok = await act(context, (api) => _isNew ? api.post('/api/admin/products', body) : api.patch('/api/admin/products/${p['id']}', body), done: 'Saved');
    if (ok) {
      navigator.pop(true);
    } else if (mounted) {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AdminPage(
        title: _isNew ? 'Add product' : 'Edit product',
        child: Narrow(
          child: ListView(
            padding: const EdgeInsets.all(14),
            children: [
              Field('Name', _name, max: 120),
              Field('Description', _description, lines: 2, max: 600),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Field('Price (Rs.)', _price, number: true)),
                  const SizedBox(width: 8),
                  Expanded(child: Field('Old price', _oldPrice, number: true, helper: 'Only if on discount')),
                ],
              ),
              DropdownButtonFormField<String>(
                initialValue: widget.categories.any((c) => c['id'] == _category) ? _category : '',
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Category'),
                items: [
                  const DropdownMenuItem(value: '', child: Text('None')),
                  for (final c in widget.categories) DropdownMenuItem(value: '${c['id']}', child: Text('${c['name']}')),
                ],
                onChanged: (v) => setState(() => _category = v ?? ''),
              ),
              const Gap(),
              PhotoField(url: _image, onChanged: (u) => setState(() => _image = u)),
              SwitchRow('Show as popular / featured', _featured, (v) => setState(() => _featured = v)),
              const Gap(height: 6),
              ShopDateTimeField(label: 'Unavailable until (turns back on by itself)', value: _unavailableUntil, onChanged: (v) => setState(() => _unavailableUntil = v)),
              const Gap(),
              SwitchRow('Count stock for this item', _track, (v) => setState(() => _track = v)),
              if (_track) ...[
                if (_isNew) Field('Stock quantity', _stock, number: true) else Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('Current stock: ${p['stockQty'] ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800))),
                Field('Warn when stock is at or below', _threshold, number: true),
                if (!_isNew) ...[
                  TextField(
                    controller: _delta,
                    keyboardType: const TextInputType.numberWithOptions(signed: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^-?\d*'))],
                    decoration: const InputDecoration(labelText: 'Add / remove stock (e.g. 20 or -3)'),
                  ),
                  const Gap(),
                  Field('Reason', _reason, hint: 'e.g. new delivery', max: 200),
                ],
              ],
              const Muted('Stock is reserved when a customer places an order and returned if the order is cancelled.'),
              const Gap(height: 14),
              BusyButton(busy: _busy, onPressed: _save, label: 'Save'),
            ],
          ),
        ),
      );
}

/// The current photo with a button to choose another.
class PhotoField extends StatefulWidget {
  const PhotoField({super.key, required this.url, required this.onChanged});

  final String? url;
  final ValueChanged<String?> onChanged;

  @override
  State<PhotoField> createState() => _PhotoFieldState();
}

class _PhotoFieldState extends State<PhotoField> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final url = widget.url;
    return Row(
      children: [
        ClipRRect(borderRadius: BorderRadius.circular(10), child: SizedBox(width: 64, height: 64, child: NetImage(url, width: 256))),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () async {
                    setState(() => _busy = true);
                    final next = await pickAndUploadImage(context);
                    if (next != null) widget.onChanged(next);
                    if (mounted) setState(() => _busy = false);
                  },
            icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.photo_outlined, size: 18),
            label: Text(_busy ? 'Uploading…' : (url == null || url.isEmpty ? 'Choose photo' : 'Change photo')),
          ),
        ),
        if (url != null && url.isNotEmpty) IconButton(tooltip: 'Remove photo', onPressed: () => widget.onChanged(null), icon: const Icon(Icons.close)),
      ],
    );
  }
}
