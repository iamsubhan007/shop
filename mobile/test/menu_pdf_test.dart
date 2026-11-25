import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:hbt_app/api/api_client.dart';
import 'package:hbt_app/api/token_store.dart';
import 'package:hbt_app/widgets/menu_pdf_button.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

void main() {
  final pdf = Uint8List.fromList(utf8.encode('%PDF-1.7\nmenu\n%%EOF'));

  Future<List<(String, Uint8List)>> pump(WidgetTester tester, Future<http.Response> Function(http.Request) answer, {bool cancel = false}) async {
    final saved = <(String, Uint8List)>[];
    final api = ApiClient(baseUrl: 'https://shop.example', tokens: MemoryTokenStore(), isWeb: false, client: MockClient(answer));
    await tester.pumpWidget(
      Provider<ApiClient>.value(
        value: api,
        child: MaterialApp(
          home: Scaffold(
            body: MenuPdfButton(save: (name, bytes) async {
              saved.add((name, bytes));
              return !cancel;
            }),
          ),
        ),
      ),
    );
    return saved;
  }

  testWidgets('downloads the published menu from the website, with loading and success states', (tester) async {
    final gate = Completer<void>();
    final asked = <String>[];
    final saved = await pump(tester, (r) async {
      asked.add(r.url.path);
      await gate.future;
      return http.Response.bytes(pdf, 200, headers: {'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Haq-Bahu-Tandoor-Menu-2026-11-25.pdf"'});
    });

    await tester.tap(find.text('Download Menu (PDF)'));
    await tester.pump();
    expect(find.text('Preparing menu…'), findsOneWidget);

    gate.complete();
    await tester.pump(const Duration(milliseconds: 50));
    expect(asked, ['/api/menu/pdf']);
    expect(saved.single.$1, 'Haq-Bahu-Tandoor-Menu-2026-11-25.pdf');
    expect(saved.single.$2, pdf);
    expect(find.text('Menu saved'), findsOneWidget);

    await tester.pump(const Duration(seconds: 6));
    expect(find.text('Download Menu (PDF)'), findsOneWidget);
  });

  testWidgets('shows the server\'s reason when it fails, and can be tried again', (tester) async {
    var fail = true;
    final saved = await pump(tester, (r) async => fail
        ? http.Response(jsonEncode({'error': 'The menu PDF could not be prepared right now.'}), 503)
        : http.Response.bytes(pdf, 200, headers: {'content-type': 'application/pdf'}));

    await tester.tap(find.text('Download Menu (PDF)'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.textContaining('could not be prepared'), findsOneWidget);
    expect(saved, isEmpty);

    fail = false;
    await tester.tap(find.text('Download Menu (PDF)'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(saved.single.$1, 'Menu.pdf');
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('never saves something that is not a PDF, and a cancelled save is not reported as saved', (tester) async {
    var saved = await pump(tester, (r) async => http.Response('<html>wifi sign-in</html>', 200));
    await tester.tap(find.text('Download Menu (PDF)'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(saved, isEmpty);
    expect(find.textContaining('try again'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    saved = await pump(tester, (r) async => http.Response.bytes(pdf, 200), cancel: true);
    await tester.tap(find.text('Download Menu (PDF)'));
    await tester.pump(const Duration(milliseconds: 50));
    expect(saved, hasLength(1));
    expect(find.text('Menu saved'), findsNothing);
    expect(find.text('Download Menu (PDF)'), findsOneWidget);
  });
}
