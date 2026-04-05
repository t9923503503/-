import 'dart:ui';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:universal_html/html.dart' as html;
import '../providers/api.dart';

class ResetScreen extends ConsumerStatefulWidget {
  final String token;
  const ResetScreen({super.key, required this.token});

  @override
  ConsumerState<ResetScreen> createState() => _ResetScreenState();
}

class _ResetScreenState extends ConsumerState<ResetScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showPass = false;
  bool _isLoading = false;
  bool _isDone = false;
  String? _error;

  @override
  void dispose() {
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() { _isLoading = true; _error = null; });

    try {
      await ref.read(dioProvider).post('/auth/reset-password/confirm', data: {
        'token': widget.token,
        'password': _passCtrl.text,
      });
      setState(() { _isLoading = false; _isDone = true; });
    } on DioException catch (e) {
      final msg = ((e.response?.data as Map?)?['error'] as String?) ?? 'Ошибка сброса';
      setState(() { _isLoading = false; _error = msg; });
    } catch (_) {
      setState(() { _isLoading = false; _error = 'Ошибка сброса пароля'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1A0033), Color(0xFF0A0A1F)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const Icon(Icons.lock_reset, size: 64, color: Color(0xFFFF9500)),
                  const SizedBox(height: 16),
                  Text('НОВЫЙ ПАРОЛЬ',
                      style: GoogleFonts.russoOne(fontSize: 28, color: Colors.white)),
                  const SizedBox(height: 32),
                  if (_isDone) ...[
                    const Icon(Icons.check_circle, size: 64, color: Colors.greenAccent),
                    const SizedBox(height: 16),
                    const Text('Пароль успешно изменён!',
                        style: TextStyle(color: Colors.white, fontSize: 18)),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () => html.window.location.href = '/play/index.html',
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFF9500),
                        minimumSize: const Size(240, 50),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('ВОЙТИ', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                    ),
                  ] else
                    ClipRRect(
                      borderRadius: BorderRadius.circular(30),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
                        child: Container(
                          padding: const EdgeInsets.all(24),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(30),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                          ),
                          child: Form(
                            key: _formKey,
                            child: Column(
                              children: [
                                if (_error != null) ...[
                                  Container(
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.redAccent.withValues(alpha: 0.15),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
                                  ),
                                  const SizedBox(height: 16),
                                ],
                                TextFormField(
                                  controller: _passCtrl,
                                  obscureText: !_showPass,
                                  validator: (v) => (v?.length ?? 0) < 6 ? 'Мин. 6 символов' : null,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: InputDecoration(
                                    hintText: 'НОВЫЙ ПАРОЛЬ',
                                    hintStyle: const TextStyle(color: Colors.white24),
                                    prefixIcon: const Icon(Icons.lock, color: Color(0xFFFF9500), size: 20),
                                    suffixIcon: IconButton(
                                      icon: Icon(_showPass ? Icons.visibility : Icons.visibility_off, color: Colors.white38),
                                      onPressed: () => setState(() => _showPass = !_showPass),
                                    ),
                                    filled: true,
                                    fillColor: Colors.white.withValues(alpha: 0.05),
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFFF9500))),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                TextFormField(
                                  controller: _confirmCtrl,
                                  obscureText: !_showPass,
                                  validator: (v) => v != _passCtrl.text ? 'Пароли не совпадают' : null,
                                  style: const TextStyle(color: Colors.white),
                                  decoration: InputDecoration(
                                    hintText: 'ПОДТВЕРДИТЕ ПАРОЛЬ',
                                    hintStyle: const TextStyle(color: Colors.white24),
                                    prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFFFF9500), size: 20),
                                    filled: true,
                                    fillColor: Colors.white.withValues(alpha: 0.05),
                                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFFF9500))),
                                  ),
                                ),
                                const SizedBox(height: 24),
                                ElevatedButton(
                                  onPressed: _isLoading ? null : _submit,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFFF9500),
                                    minimumSize: const Size(double.infinity, 55),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: _isLoading
                                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2.5))
                                      : const Text('СОХРАНИТЬ ПАРОЛЬ', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
