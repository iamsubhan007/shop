/// Shapes as returned by the website's public API.
const menuJson = <String, dynamic>{
  'categories': [
    {'id': 'c1', 'name': 'Special Items', 'slug': 'special-items', 'paused': false},
    {'id': 'c2', 'name': 'Regular Items', 'slug': 'regular-items', 'paused': false},
  ],
  'products': [
    {
      'id': 'p1',
      'name': 'Nutella Naan',
      'description': 'Warm naan with Nutella.',
      'price': 500,
      'compareAtPrice': null,
      'imageUrl': '/Nutella.jpg',
      'additionalImages': ['/Nutella.jpg'],
      'categoryId': 'c1',
      'categoryName': 'Special Items',
      'available': true,
      'soldOut': false,
    },
    {
      'id': 'p2',
      'name': 'Sada Naan',
      'description': '',
      'price': 40,
      'imageUrl': '/sada.jpg',
      'additionalImages': <String>[],
      'categoryId': 'c2',
      'categoryName': 'Regular Items',
      'available': false,
      'soldOut': true,
    },
  ],
  'deals': [
    {'id': 'd1', 'title': 'Family Deal', 'description': 'Two naans', 'price': 900, 'originalPrice': 1000, 'imageUrl': '/deal1.png', 'items': ['2x Nutella Naan'], 'badge': 'Best value'},
  ],
};

const settingsJson = <String, dynamic>{
  'shop': {
    'name': 'Haq Bahu Tandoor',
    'address': 'Model Town Extension, Lahore',
    'lat': 31.4766319,
    'lng': 74.3147178,
    'maps_url': 'https://maps.app.goo.gl/x',
    'phone': '03094130285',
    'whatsapp': '03094130285',
    'hours': '8:00 AM - 11:00 PM',
  },
  'delivery': {'enabled': true, 'radius_m': 1000, 'fee': 100, 'free_over': 0, 'min_order': 0},
  'pickup': {'enabled': true},
  'paymentMethods': {'bank_transfer': true, 'jazzcash': true, 'easypaisa': false},
  'orderingState': {'open': true, 'notice': ''},
  'deliveryState': {'available': true, 'reason': null, 'notice': ''},
};
