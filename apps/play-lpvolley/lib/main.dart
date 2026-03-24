import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'screens/auth_screen.dart';
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
    return MaterialApp(
      title: 'Лютые Пляжники | Play',
      debugShowCheckedModeBanner: false,
      theme: buildLyutyiTheme(),
      home: const AuthScreen(),
      onGenerateRoute: (settings) {
        if (settings.name == '/auth') {
          return MaterialPageRoute(
            builder: (_) => const AuthScreen(),
          );
        }
        return null;
      },
    );
  }
}
