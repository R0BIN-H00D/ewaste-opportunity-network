import 'package:ewaste_opportunity/models/geo_place.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/marketplace_providers.dart';
import 'package:ewaste_opportunity/providers/location_providers.dart';
import 'package:ewaste_opportunity/screens/marketplace/marketplace_screen.dart';
import 'package:ewaste_opportunity/screens/marketplace/order_details_screen.dart';
import 'package:ewaste_opportunity/screens/marketplace/orders_screen.dart';
import 'package:ewaste_opportunity/screens/marketplace/product_details_screen.dart';
import 'package:ewaste_opportunity/services/razorpay_checkout.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(
    WidgetTester tester, Widget screen, FakeMarketplaceRepository repo,
    {PaymentLauncher? launcher, FakeLocationService? phone, FakeGeoRepository? geo}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(
          path: '/shop/:id',
          builder: (_, s) =>
              Scaffold(body: Text('product page ${s.pathParameters['id']}'))),
      GoRoute(
          path: '/orders/:id',
          builder: (_, s) =>
              Scaffold(body: Text('order page ${s.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        marketplaceRepositoryProvider.overrideWithValue(repo),
        if (launcher != null) paymentLauncherProvider.overrideWithValue(launcher),
        if (phone != null) locationServiceProvider.overrideWithValue(phone),
        if (geo != null) geoRepositoryProvider.overrideWithValue(geo),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        categoriesProvider.overrideWith((ref) async =>
            const [Category(id: 'c2', name: 'Laptops', slug: 'laptops')]),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Taps and lets a dialog, sheet or answer finish (the pulsing skeletons keep `pumpAndSettle` from ever returning).
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) =>
    find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

void main() {
  group('the shop', () {
    testWidgets(
        'each product shows the Refurbished label with its grade, price and seller',
        (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [
          sampleProduct(),
          sampleProduct(id: 'p2', title: 'Refurbished Pixel')
        ]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      expect(find.text('Refurbished ThinkPad'), findsOneWidget);
      expect(find.text('Refurbished Pixel'), findsOneWidget);
      expect(find.text('Refurbished · Good'), findsNWidgets(2));
      expect(find.text(formatPrice(24999)), findsNWidgets(2));
      expect(find.text('ReNew Devices, Pune'), findsNWidgets(2));
    });

    testWidgets(
        'the filters sit behind one button, and nothing is sent until "Show results"',
        (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [sampleProduct()]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      // No rows of chips on the page itself.
      expect(find.widgetWithText(AppChip, 'Excellent'), findsNothing);
      await _tap(tester, find.byIcon(Icons.tune_rounded));
      await _tap(tester, find.widgetWithText(AppChip, 'Excellent'));
      expect(repo.productQueries.last.condition, '');
      await _tap(tester, find.text('Show results'));
      expect(repo.productQueries.last.condition, 'excellent');
    });

    testWidgets('a switched-on filter shows as a pill that removes it',
        (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [sampleProduct()]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      await _tap(tester, find.byIcon(Icons.tune_rounded));
      await _tap(tester, find.widgetWithText(AppChip, 'Excellent'));
      await _tap(tester, find.text('Show results'));
      expect(find.text('Clear filters'), findsOneWidget);

      await _tap(tester, find.bySemanticsLabel('Remove filter: Excellent'));
      expect(repo.productQueries.last.condition, '');
      expect(find.text('Clear filters'), findsNothing);
    });

    testWidgets('a category and a sort order are sent to the server',
        (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [sampleProduct()]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      await _tap(tester, find.byIcon(Icons.tune_rounded));
      await _tap(tester, find.widgetWithText(AppChip, 'Laptops'));
      await _tap(tester, find.widgetWithText(AppChip, 'Price: low to high'));
      await _tap(tester, find.text('Show results'));
      expect(repo.productQueries.last.category, 'laptops');
      expect(repo.productQueries.last.sort, 'price_asc');
    });

    testWidgets('"Clear all" in the sheet resets every choice', (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [sampleProduct()]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      await _tap(tester, find.byIcon(Icons.tune_rounded));
      await _tap(tester, find.widgetWithText(AppChip, 'Laptops'));
      await _tap(tester, find.text('Clear all'));
      await _tap(tester, find.text('Show results'));
      expect(repo.productQueries.last.category, '');
    });

    testWidgets('searching asks for that text after a short pause',
        (tester) async {
      final repo = FakeMarketplaceRepository(productPages: {
        1: [sampleProduct()]
      });
      await _pump(tester, const MarketplaceScreen(), repo);

      await tester.enterText(find.byType(TextField), 'thinkpad');
      await tester.pump(const Duration(milliseconds: 500));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(repo.productQueries.last.q, 'thinkpad');
    });

    testWidgets('says so when nothing is for sale', (tester) async {
      await _pump(
          tester, const MarketplaceScreen(), FakeMarketplaceRepository());
      expect(find.text('Nothing for sale here'), findsOneWidget);
    });

    testWidgets('tapping a product opens it', (tester) async {
      await _pump(
          tester,
          const MarketplaceScreen(),
          FakeMarketplaceRepository(productPages: {
            1: [sampleProduct()]
          }));
      await _tap(tester, find.text('Refurbished ThinkPad'));
      expect(find.text('product page p1'), findsOneWidget);
    });
  });

  group('a product', () {
    testWidgets('has an About this device card with the parts, and Read more for the rest', (tester) async {
      await _pump(
          tester,
          const ProductDetailsScreen(id: 'p1'),
          FakeMarketplaceRepository(
              product: sampleProduct(conditionDetails: const {'power': 'works_normally', 'battery': 'drains_fast', 'screen': 'no_damage', 'body': 'scratched_or_dented', 'water': 'none'}, conditionNote: 'Charger included.')));
      expect(find.text('About this device'), findsOneWidget);
      expect(find.text('Overall condition: Good'), findsOneWidget);
      expect(find.text('Drains quickly'), findsOneWidget);
      expect(find.text('Water damage'), findsNothing);
      await _tap(tester, find.text('Read more'));
      expect(find.text('Water damage'), findsOneWidget);
      expect(find.text('Charger included.'), findsOneWidget);
    });

    testWidgets('says when the seller has not added the parts yet', (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), FakeMarketplaceRepository());
      expect(find.text('About this device'), findsOneWidget);
      expect(find.textContaining('has not added the details of each part yet'), findsOneWidget);
    });

    testWidgets(
        'shows the label, what was done, the specifications and the seller',
        (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'),
          FakeMarketplaceRepository());

      expect(find.text('Refurbished · Good'), findsOneWidget);
      expect(find.text('3 in stock'), findsOneWidget);
      expect(find.text('What was done'), findsOneWidget);
      expect(find.textContaining('Replaced the battery'), findsOneWidget);
      expect(find.text('RAM'), findsOneWidget);
      expect(find.text('8 GB'), findsOneWidget);
      expect(find.text('ReNew Devices, Pune'), findsOneWidget);
      expect(
          find.textContaining('The app never handles money'), findsOneWidget);
    });

    testWidgets('ordering asks how many and how to pay, then opens the order',
        (tester) async {
      final repo = FakeMarketplaceRepository();
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), repo);

      await _tap(tester, find.text('Order this'));
      expect(find.text('Order Refurbished ThinkPad'), findsOneWidget);
      await _tap(tester, find.byTooltip('One more'));
      expect(find.text('Total: ${formatPrice(24999 * 2)}'), findsOneWidget);
      await _tap(
          tester, find.widgetWithText(AppChip, 'Pay the seller directly'));
      await _tap(tester, find.text('Place order'));
      expect(find.text('Enter the area or locality to deliver to'),
          findsOneWidget);
      expect(find.text('Enter the city (letters only)'), findsOneWidget);
      expect(find.text('Enter a valid 6-digit pincode'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Area or locality'),
          'Indiranagar');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'City'), 'Bengaluru');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pincode'), '560038');
      await _tap(tester, find.text('Place order'));

      expect(repo.calls, ['place:p1:2:offline:Indiranagar:Bengaluru:560038:']);
      expect(find.text('order page o-new'), findsOneWidget);
    });

    testWidgets('the quantity cannot go above the stock', (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'),
          FakeMarketplaceRepository(product: sampleProduct(stock: 1)));
      await _tap(tester, find.text('Order this'));
      final more = tester.widget<IconButton>(find.ancestor(
          of: find.byIcon(Icons.add_circle_outline),
          matching: find.byType(IconButton)));
      expect(more.onPressed, isNull);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeMarketplaceRepository()
        ..actionError = const ApiException(
            'You already have an open order for this product',
            code: 'ALREADY_ORDERED');
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), repo);

      await _tap(tester, find.text('Order this'));
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Area or locality'),
          'Indiranagar');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'City'), 'Bengaluru');
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Pincode'), '560038');
      await _tap(tester, find.text('Place order'));
      expect(find.text('You already have an open order for this product'),
          findsOneWidget);
      expect(find.text('order page o-new'), findsNothing);
    });

    testWidgets('a question needs a few words, then goes to the seller',
        (tester) async {
      final repo = FakeMarketplaceRepository();
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), repo);

      await _tap(tester, find.text('Ask the seller'));
      await _tap(tester, find.text('Send question'));
      expect(
          find.text('Write a short question for the seller'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Your question'),
          'Is the battery new?');
      await _tap(tester, find.text('Send question'));
      expect(repo.calls, ['enquire:p1:Is the battery new?']);
      expect(find.text('Question sent. The seller has been told.'),
          findsOneWidget);
    });

    testWidgets('your own product cannot be ordered', (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'),
          FakeMarketplaceRepository(product: sampleProduct(isMine: true)));
      expect(find.text('This is your own product.'), findsOneWidget);
      expect(find.text('Order this'), findsNothing);
    });

    testWidgets('a sold-out product cannot be ordered', (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'),
          FakeMarketplaceRepository(product: sampleProduct(stock: 0)));
      expect(find.text('Sold out'), findsOneWidget);
      expect(find.text('Not available'), findsOneWidget);
      expect(find.text('Order this'), findsNothing);
    });
  });

  group('the orders list', () {
    testWidgets('shows each order with the seller, the total and the status',
        (tester) async {
      final repo = FakeMarketplaceRepository(pages: {
        1: [sampleOrder(id: 'a'), sampleOrder(id: 'b', status: 'completed')],
      });
      await _pump(tester, const OrdersScreen(), repo);

      expect(find.text('Refurbished ThinkPad'), findsNWidgets(2));
      expect(find.text('ReNew Devices'), findsNWidgets(2));
      expect(find.text('2 × ${formatPrice(24999)} = ${formatPrice(49998)}'),
          findsNWidgets(2));
      expect(find.text('Waiting for the seller'), findsWidgets);
      expect(find.text('Completed'), findsWidgets);
    });

    testWidgets('a status chip asks for that status; an empty list says so',
        (tester) async {
      final repo = FakeMarketplaceRepository();
      await _pump(tester, const OrdersScreen(), repo);
      expect(find.text('No orders yet'), findsOneWidget);

      await _tap(tester, find.widgetWithText(AppChip, 'Completed'));
      expect(repo.listCalls.last.status, 'completed');
      expect(find.text('Nothing here'), findsOneWidget);
    });

    testWidgets('a seller sees the buyer and their own wording',
        (tester) async {
      await _pump(
          tester,
          const OrdersScreen(),
          FakeMarketplaceRepository(pages: {
            1: [sampleOrder(role: 'seller')]
          }));
      expect(find.text('Asha'), findsOneWidget);
      expect(find.text('New order'), findsOneWidget);
    });

    testWidgets('tapping an order opens it', (tester) async {
      await _pump(
          tester,
          const OrdersScreen(),
          FakeMarketplaceRepository(pages: {
            1: [sampleOrder(id: 'zz')]
          }));
      await _tap(tester, find.text('Refurbished ThinkPad'));
      expect(find.text('order page zz'), findsOneWidget);
    });
  });

  group('an order, for the buyer', () {
    testWidgets('shows the product, the total, the payment and the history',
        (tester) async {
      await _pump(tester, const OrderDetailsScreen(id: 'o1'),
          FakeMarketplaceRepository(current: sampleOrder(actions: ['cancel'])));

      expect(find.text('Refurbished ThinkPad'), findsOneWidget);
      expect(find.text('Refurbished · Good'), findsOneWidget);
      expect(find.textContaining('Waiting for ReNew Devices to confirm'),
          findsOneWidget);
      expect(find.text(formatPrice(49998)), findsOneWidget);
      expect(find.text('Cash on delivery'), findsOneWidget);
      expect(find.text('Indiranagar'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
    });

    testWidgets('cancelling asks for an optional reason and shows the result',
        (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(actions: ['cancel']))
        ..result =
            sampleOrder(status: 'cancelled', cancelReason: 'Changed my mind');
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      await _tap(tester, find.text('Cancel order'));
      await tester.enterText(
          find.descendant(
              of: find.byType(AlertDialog), matching: find.byType(TextField)),
          'Changed my mind');
      await _tap(tester, _inDialog('Cancel order'));

      expect(repo.calls, ['cancel:Changed my mind']);
      expect(find.text('Reason: Changed my mind'), findsOneWidget);
      expect(find.text('Cancel order'), findsNothing);
    });

    testWidgets('confirming receipt completes the order after a check',
        (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(status: 'delivered', actions: ['complete']))
        ..result = sampleOrder(
            status: 'completed',
            canReview: true,
            paymentStatus: 'paid_offline');
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      await _tap(tester, find.text('I received it'));
      expect(find.textContaining('You pay ReNew Devices directly'),
          findsOneWidget);
      await _tap(tester, _inDialog('Yes, I received it'));

      expect(repo.calls, ['complete']);
      expect(find.text('Paid directly to the seller'), findsOneWidget);
      expect(find.text('Review the seller'), findsOneWidget);
    });

    testWidgets(
        'a completed order can be reviewed once; the stars are required',
        (tester) async {
      final semantics = tester.ensureSemantics();
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(status: 'completed', canReview: true))
        ..result = sampleOrder(status: 'completed', reviewed: true);
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      await _tap(tester, find.text('Review the seller'));
      expect(find.text('How did ReNew Devices do?'), findsOneWidget);
      expect(find.text('Your review helps other people choose a seller.'),
          findsOneWidget);
      await _tap(tester, find.text('Send review'));
      expect(find.text('Choose a star rating.'), findsOneWidget);

      await _tap(tester, find.bySemanticsLabel('Overall rating, 5 stars'));
      await _tap(tester, find.text('Send review'));
      expect(repo.calls, ['review:{rating: 5}']);
      expect(find.text('Review the seller'), findsNothing);
      semantics.dispose();
    });

    testWidgets('if the other side changed it first, says so', (tester) async {
      final repo =
          FakeMarketplaceRepository(current: sampleOrder(actions: ['cancel']))
            ..actionError = const ApiException(
                'This order was just changed. Reload the page and try again.',
                code: 'STALE_STATE',
                failure: ApiFailure.conflict);
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      await _tap(tester, find.text('Cancel order'));
      await _tap(tester, _inDialog('Cancel order'));
      expect(
          find.text(
              'This order was just changed. Reload the page and try again.'),
          findsOneWidget);
    });
  });

  group('detecting the delivery address', () {
    String text(WidgetTester tester, String label) => tester.widget<TextFormField>(find.widgetWithText(TextFormField, label)).controller!.text;

    testWidgets('fills the area, city and pincode from where the phone is', (tester) async {
      final repo = FakeMarketplaceRepository();
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), repo,
          phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)),
          geo: FakeGeoRepository(place: const GeoPlace(area: 'Indiranagar', city: 'Bengaluru', postcode: '560038')));
      await _tap(tester, find.text('Order this'));
      await _tap(tester, find.text('Detect my current location'));

      expect(text(tester, 'Area or locality'), 'Indiranagar');
      expect(text(tester, 'City'), 'Bengaluru');
      expect(text(tester, 'Pincode'), '560038');
    });

    testWidgets('leaves a pincode that is not six digits empty', (tester) async {
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), FakeMarketplaceRepository(),
          phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)),
          geo: FakeGeoRepository(place: const GeoPlace(area: 'Indiranagar', city: 'Bengaluru', postcode: '56')));
      await _tap(tester, find.text('Order this'));
      await _tap(tester, find.text('Detect my current location'));
      expect(text(tester, 'Pincode'), isEmpty);
      expect(text(tester, 'City'), 'Bengaluru');
    });

    testWidgets('GPS off: an alert asks to turn it on and nothing is filled', (tester) async {
      final phone = FakeLocationService.failing(LocationProblem.serviceOff);
      await _pump(tester, const ProductDetailsScreen(id: 'p1'), FakeMarketplaceRepository(), phone: phone);
      await _tap(tester, find.text('Order this'));
      await _tap(tester, find.text('Detect my current location'));

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.textContaining('Turn on GPS to fill in your address'), findsOneWidget);
      expect(text(tester, 'City'), isEmpty);
    });
  });

  group('paying online', () {
    final proof = const PaymentProof(orderId: 'order_1', paymentId: 'pay_1', signature: 'sig');

    testWidgets('shows a Pay button, opens the window and sends the proof to the server', (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(paymentMethod: 'online', paymentStatus: 'unpaid', actions: ['pay', 'cancel']))
        ..result = sampleOrder(paymentMethod: 'online', paymentStatus: 'paid_online', actions: ['cancel']);
      final launcher = FakePaymentLauncher(proof: proof);
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo, launcher: launcher);

      expect(find.text('Pay online'), findsOneWidget);
      await _tap(tester, find.textContaining('Pay ₹'));

      expect(launcher.opened, 1);
      expect(repo.calls, containsAllInOrder(['startPayment:o1', 'verifyPayment:o1:pay_1']));
      expect(find.text('Paid online'), findsOneWidget);
      expect(find.textContaining('Pay ₹'), findsNothing); // no Pay button once paid
      expect(find.byIcon(Icons.payment_rounded), findsNothing);
    });

    testWidgets('closing the window leaves the order as it was and does not call verify', (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(paymentMethod: 'online', paymentStatus: 'unpaid', actions: ['pay']));
      final launcher = FakePaymentLauncher(error: const PaymentCancelled());
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo, launcher: launcher);

      await _tap(tester, find.textContaining('Pay ₹'));

      expect(launcher.opened, 1);
      expect(repo.calls.where((c) => c.startsWith('verifyPayment')), isEmpty);
      expect(find.textContaining('Pay ₹'), findsOneWidget); // can try again
    });

    testWidgets('a failed payment shows the reason and keeps the Pay button', (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(paymentMethod: 'online', paymentStatus: 'unpaid', actions: ['pay']));
      final launcher = FakePaymentLauncher(error: const PaymentFailed('Card declined'));
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo, launcher: launcher);

      await _tap(tester, find.textContaining('Pay ₹'));

      expect(find.text('Card declined'), findsOneWidget);
      expect(find.textContaining('Pay ₹'), findsOneWidget);
    });

    testWidgets('cash on delivery has no Pay button', (tester) async {
      await _pump(tester, const OrderDetailsScreen(id: 'o1'),
          FakeMarketplaceRepository(current: sampleOrder(actions: ['cancel'])));
      expect(find.textContaining('Pay ₹'), findsNothing);
    });
  });

  group('an order, for the seller', () {
    testWidgets('a new order is confirmed, then marked ready', (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(role: 'seller', actions: ['confirm', 'cancel']))
        ..result = sampleOrder(
            role: 'seller',
            status: 'confirmed',
            actions: ['mark_ready', 'cancel']);
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      expect(find.text('New order'), findsWidgets);
      expect(find.text('Asha'), findsOneWidget);
      await _tap(tester, find.text('Confirm order'));
      expect(repo.calls, ['confirm']);
      expect(find.text('Mark ready'), findsOneWidget);
      expect(find.text('Confirm order'), findsNothing);

      repo.result = sampleOrder(
          role: 'seller',
          status: 'ready',
          actions: ['mark_delivered', 'cancel']);
      await _tap(tester, find.text('Mark ready'));
      expect(repo.calls, ['confirm', 'ready']);
      expect(find.text('Mark handed over'), findsOneWidget);
    });

    testWidgets(
        'handing over is confirmed first, and the seller never sees the buyer\'s receipt button',
        (tester) async {
      final repo = FakeMarketplaceRepository(
          current: sampleOrder(
              role: 'seller',
              status: 'ready',
              actions: ['mark_delivered', 'cancel']));
      await _pump(tester, const OrderDetailsScreen(id: 'o1'), repo);

      expect(find.text('I received it'), findsNothing);
      await _tap(tester, find.text('Mark handed over'));
      await _tap(tester, _inDialog('Yes, handed over'));
      expect(repo.calls, ['delivered']);
    });
  });
}
