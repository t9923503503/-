import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:universal_html/html.dart' as html;

import 'screens/auth_screen.dart';
import 'screens/reset_screen.dart';
import 'theme.dart';

void main() {
  usePathUrlStrategy();

  runApp(
    const ProviderScope(
      child: LyutyiApp(),
    ),
  );
}

class LyutyiApp extends StatelessWidget {
  const LyutyiApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Проверяем query-параметры для роутинга (reset password flow)
    final uri = Uri.parse(html.window.location.href);
    final route = uri.queryParameters['route'];
    final token = uri.queryParameters['token'];

    Widget home;
    if (route == 'reset' && token != null && token.isNotEmpty) {
      home = ResetScreen(token: token);
    } else {
      home = const AuthScreen();
    }

    return MaterialApp(
      title: 'Лютые Пляжники | Play',
      debugShowCheckedModeBanner: false,
      theme: buildLyutyiTheme(),
      home: home,
      onGenerateRoute: (settings) {
        if (settings.name == '/auth') {
          return MaterialPageRoute(builder: (_) => const AuthScreen());
        }
        return MaterialPageRoute(builder: (_) => const AuthScreen());
      },
    );
  }
}
