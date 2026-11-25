import '../utils/format.dart';

List<String> _strings(Object? v) => v is List ? v.map((e) => '$e').toList() : const [];
List<Map<String, dynamic>> maps(Object? v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];

class Category {
  const Category({required this.id, required this.name, this.paused = false});

  final String id;
  final String name;
  final bool paused;

  factory Category.fromJson(Map<String, dynamic> j) =>
      Category(id: '${j['id']}', name: '${j['name']}', paused: j['paused'] == true);
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.price,
    this.description = '',
    this.compareAtPrice,
    this.imageUrl,
    this.images = const [],
    this.categoryId,
    this.categoryName = '',
    this.available = true,
    this.soldOut = false,
    this.lowStock = false,
    this.isFeatured = false,
  });

  final String id;
  final String name;
  final String description;
  final num price;
  final num? compareAtPrice;
  final String? imageUrl;
  final List<String> images;
  final String? categoryId;
  final String categoryName;
  final bool available;
  final bool soldOut;
  final bool lowStock;
  final bool isFeatured;

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: '${j['id']}',
        name: '${j['name']}',
        description: '${j['description'] ?? ''}',
        price: asNum(j['price']),
        compareAtPrice: j['compareAtPrice'] == null ? null : asNum(j['compareAtPrice']),
        imageUrl: j['imageUrl'] as String?,
        images: _strings(j['additionalImages']),
        categoryId: j['categoryId'] as String?,
        categoryName: '${j['categoryName'] ?? ''}',
        available: j['available'] != false,
        soldOut: j['soldOut'] == true,
        lowStock: j['lowStock'] == true,
        isFeatured: j['isFeatured'] == true,
      );

  List<String> get gallery => images.isNotEmpty ? images : [?imageUrl];
}

class Deal {
  const Deal({
    required this.id,
    required this.title,
    required this.price,
    this.description = '',
    this.originalPrice,
    this.imageUrl,
    this.items = const [],
    this.badge,
  });

  final String id;
  final String title;
  final String description;
  final num price;
  final num? originalPrice;
  final String? imageUrl;
  final List<String> items;
  final String? badge;

  factory Deal.fromJson(Map<String, dynamic> j) => Deal(
        id: '${j['id']}',
        title: '${j['title']}',
        description: '${j['description'] ?? ''}',
        price: asNum(j['price']),
        originalPrice: j['originalPrice'] == null ? null : asNum(j['originalPrice']),
        imageUrl: j['imageUrl'] as String?,
        items: _strings(j['items']),
        badge: (j['badge'] as String?)?.trim().isEmpty ?? true ? null : j['badge'] as String,
      );
}

class MenuData {
  const MenuData({this.categories = const [], this.products = const [], this.deals = const []});

  final List<Category> categories;
  final List<Product> products;
  final List<Deal> deals;

  factory MenuData.fromJson(Map<String, dynamic> j) => MenuData(
        categories: maps(j['categories']).map(Category.fromJson).toList(),
        products: maps(j['products']).map(Product.fromJson).toList(),
        deals: maps(j['deals']).map(Deal.fromJson).toList(),
      );

  /// Products grouped under their category, in the shop's order. Anything without a listed category goes last.
  List<(String, List<Product>)> sections(Iterable<Product> shown) {
    final out = <(String, List<Product>)>[];
    final placed = <String>{};
    for (final c in categories) {
      final items = shown.where((p) => p.categoryId == c.id).toList();
      placed.addAll(items.map((p) => p.id));
      if (items.isNotEmpty) out.add((c.name, items));
    }
    final rest = shown.where((p) => !placed.contains(p.id)).toList();
    if (rest.isNotEmpty) out.add(('More', rest));
    return out;
  }
}
