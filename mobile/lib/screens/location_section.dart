import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../models/settings.dart';
import '../state/cart_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Lets the customer drop a delivery pin (GPS or map tap) and asks the server whether it is inside the delivery
/// radius. Checkout checks it again on the server.
class LocationSection extends StatefulWidget {
  const LocationSection({super.key, required this.settings});

  final ShopSettings settings;

  @override
  State<LocationSection> createState() => _LocationSectionState();
}

class _LocationSectionState extends State<LocationSection> {
  final _map = MapController();
  late final TextEditingController _address;
  bool _busy = false;
  String? _warning;

  @override
  void initState() {
    super.initState();
    final cart = context.read<CartState>();
    _address = TextEditingController(text: cart.address);
    // A pin saved earlier is asked about again: delivery hours or the radius may have changed since.
    final saved = cart.location;
    if (saved != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _check(saved.lat, saved.lng);
      });
    }
  }

  @override
  void dispose() {
    _address.dispose();
    _map.dispose();
    super.dispose();
  }

  static LatLngBounds _circleBounds(LatLng centre, double radiusM) {
    const distance = Distance();
    final reach = radiusM * 1.1;
    return LatLngBounds.fromPoints([for (final bearing in [0, 90, 180, 270]) distance.offset(centre, reach, bearing)]);
  }

  Future<void> _check(double lat, double lng) async {
    final api = context.read<ApiClient>();
    final cart = context.read<CartState>();
    setState(() => _busy = true);
    try {
      final r = await api.post('/api/delivery/check', body: {'latitude': lat, 'longitude': lng});
      cart.setLocation(DeliveryLocation(lat: lat, lng: lng, eligible: r['eligible'] == true, message: '${r['message'] ?? ''}'));
    } on ApiException {
      if (mounted) setState(() => _warning = 'We couldn’t check your location. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _useGps() async {
    setState(() {
      _busy = true;
      _warning = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const _LocationProblem('Location is switched off on this phone. Turn it on, or tap the map instead.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        throw const _LocationProblem('Location permission was denied. You can tap your location on the map instead, or choose pickup.');
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)),
      );
      if (!mounted) return;
      if (p.accuracy > 500) _warning = 'Your GPS signal is weak, so the pin may be off. Please check it on the map.';
      _map.move(LatLng(p.latitude, p.longitude), 17);
      await _check(p.latitude, p.longitude);
    } on _LocationProblem catch (e) {
      if (mounted) setState(() => _warning = e.message);
    } catch (_) {
      if (mounted) setState(() => _warning = 'We couldn’t get your GPS location. Tap your location on the map, or choose pickup.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.settings;
    final cart = context.watch<CartState>();
    final location = cart.location;
    final shop = LatLng(s.lat, s.lng);
    final pin = location == null ? null : LatLng(location.lat, location.lng);

    return Panel(
      title: 'Delivery location',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Delivery is available within ${s.radiusM} m of our shop. We only use your location to check this.',
            style: const TextStyle(color: Brand.muted, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          BusyButton(busy: _busy, onPressed: _useGps, icon: Icons.my_location, label: 'Use my current location'),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(
              height: 260,
              child: FlutterMap(
                mapController: _map,
                options: MapOptions(
                  // Starts on the whole delivery circle, so it is clear where the shop delivers.
                  initialCameraFit: CameraFit.bounds(bounds: _circleBounds(shop, s.radiusM.toDouble())),
                  // Rotating by accident is confusing when all you want is to drop a pin.
                  interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
                  onTap: (_, point) {
                    setState(() => _warning = null);
                    _check(point.latitude, point.longitude);
                  },
                ),
                children: [
                  TileLayer(
                    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                    userAgentPackageName: 'com.haqbahutandoor.app',
                    maxZoom: 19,
                  ),
                  CircleLayer(
                    circles: [
                      CircleMarker(
                        point: shop,
                        radius: s.radiusM.toDouble(),
                        useRadiusInMeter: true,
                        color: Brand.red.withValues(alpha: 0.08),
                        borderColor: Brand.red,
                        borderStrokeWidth: 2,
                      ),
                    ],
                  ),
                  MarkerLayer(
                    markers: [
                      Marker(point: shop, width: 34, height: 34, child: const Icon(Icons.storefront, color: Brand.ink, size: 30)),
                      if (pin != null)
                        Marker(
                          point: pin,
                          width: 42,
                          height: 42,
                          alignment: Alignment.topCenter,
                          child: const Icon(Icons.location_pin, color: Color(0xFF2563EB), size: 42),
                        ),
                    ],
                  ),
                  const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          const Text('Or tap the map to drop a pin on your house or street.', style: TextStyle(color: Brand.muted, fontSize: 11.5)),
          if (_warning != null) ...[const SizedBox(height: 10), Notice(_warning!, kind: NoticeKind.warning)],
          if (location != null) ...[
            const SizedBox(height: 10),
            Notice(
              '${location.eligible ? 'Delivery available' : 'Outside our delivery area'}\n${location.message}',
              kind: location.eligible ? NoticeKind.success : NoticeKind.error,
            ),
            if (!location.eligible && s.pickupEnabled)
              TextButton(onPressed: () => cart.setOrderType('pickup'), child: const Text('Order for pickup instead')),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _address,
            onChanged: cart.setAddress,
            maxLength: 300,
            minLines: 2,
            maxLines: 3,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'House / street address',
              hintText: 'e.g. House 12, N Block, Model Town Extension',
              counterText: '',
            ),
          ),
        ],
      ),
    );
  }
}

class _LocationProblem implements Exception {
  const _LocationProblem(this.message);

  final String message;
}
