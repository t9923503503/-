import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

ThemeData buildLyutyiTheme() {
  final base = ThemeData.dark();
  return base.copyWith(
    brightness: Brightness.dark,
    scaffoldBackgroundColor: const Color(0xFF0A0A1F),
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFFFF9500),
      brightness: Brightness.dark,
    ),
    textTheme: GoogleFonts.interTextTheme(base.textTheme),
  );
}
