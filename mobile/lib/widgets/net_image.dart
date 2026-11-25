import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../theme.dart';

/// A picture from the website. Pictures the site hosts go through its image resizer (tens of KB instead of
/// hundreds); if that fails, the original file is loaded.
class NetImage extends StatelessWidget {
  const NetImage(this.path, {super.key, this.width = 384, this.fit = BoxFit.cover});

  final String? path;

  /// One of the widths the website's resizer allows: 256, 384, 640, 768, 1024.
  final int width;
  final BoxFit fit;

  Widget _placeholder() => const ColoredBox(
        color: Color(0xFFF4F4F5),
        child: Center(child: Icon(Icons.bakery_dining_outlined, color: Brand.muted, size: 32)),
      );

  @override
  Widget build(BuildContext context) {
    final p = path;
    if (p == null || p.isEmpty) return _placeholder();
    final api = context.read<ApiClient>();
    final original = api.url(p).toString();
    final headers = kIsWeb ? null : const {'Accept': 'image/webp,image/*'};

    Widget load(String url, Widget Function() onError) => Image.network(
          url,
          fit: fit,
          headers: headers,
          width: double.infinity,
          height: double.infinity,
          gaplessPlayback: true,
          loadingBuilder: (_, child, progress) => progress == null ? child : _placeholder(),
          errorBuilder: (_, _, _) => onError(),
        );

    if (!p.startsWith('/')) return load(original, _placeholder);
    final resized = api.url('/_next/image', {'url': p, 'w': '$width', 'q': '75'}).toString();
    return load(resized, () => load(original, _placeholder));
  }
}
