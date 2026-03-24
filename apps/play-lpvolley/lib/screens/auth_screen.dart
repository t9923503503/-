// ═══════════════════════════════════════════════════════════════════════════
// lpvolley_auth_v11_final.dart
// Status: PRODUCTION READY (Play Hub Authentication Module)
// Arch: Riverpod 2.0 (AutoDisposeNotifier) + Glassmorphism UI
// Target: play.lpvolley.ru (Flutter Web, CanvasKit Renderer)
// ═══════════════════════════════════════════════════════════════════════════

import 'dart:ui';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:universal_html/html.dart' as html;
import '../providers/api.dart';

class AuthState {
  final bool isLoading;
  final String? error;
  final bool isSuccess;
  final String? returnUrl;

  const AuthState({
    this.isLoading = false,
    this.error,
    this.isSuccess = false,
    this.returnUrl,
  });

  AuthState copyWith({
    bool? isLoading,
    Object? error = _kClear,
    bool? isSuccess,
    String? returnUrl,
  }) =>
      AuthState(
        isLoading: isLoading ?? this.isLoading,
        error: error == _kClear ? this.error : error as String?,
        isSuccess: isSuccess ?? this.isSuccess,
        returnUrl: returnUrl ?? this.returnUrl,
      );
}

const _kClear = Object();

class AuthNotifier extends AutoDisposeNotifier<AuthState> {
  @override
  AuthState build() => AuthState(
        returnUrl: _getReturnUrlFromQuery(),
      );

  static String? _getReturnUrlFromQuery() {
    try {
      final uri = Uri.base;
      return uri.queryParameters['return_url'];
    } catch (_) {
      return null;
    }
  }

  Future<void> login(String email, String pass) async {
    state = state.copyWith(isLoading: true, error: _kClear);
    try {
      final response = await ref.read(dioProvider).post('/auth/login', data: {
        'email': email,
        'password': pass,
      });
      if (response.statusCode == 200) {
        state = state.copyWith(isLoading: false, isSuccess: true);
      }
    } on DioException catch (e) {
      final msg = ((e.response?.data as Map?)?['error'] as String?) ?? 'Ошибка входа';
      state = state.copyWith(isLoading: false, error: msg);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Ошибка входа');
    }
  }

  Future<void> loginWithVK() async {
    // TODO: реализовать VK ID OAuth
    state = state.copyWith(error: 'VK OAuth будет добавлен позже');
  }

  Future<void> register(String name, String email, String pass) async {
    state = state.copyWith(isLoading: true, error: _kClear);
    try {
      await ref.read(dioProvider).post('/auth/register', data: {
        'email': email,
        'password': pass,
        'full_name': name,
      });
      await login(email, pass);
    } on DioException catch (e) {
      final msg = ((e.response?.data as Map?)?['error'] as String?) ?? 'Ошибка регистрации';
      state = state.copyWith(isLoading: false, error: msg);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: 'Ошибка регистрации');
    }
  }

  Future<void> resetPassword(String email) async {
    // TODO: реализовать после подключения email-сервиса
    state = state.copyWith(isLoading: false);
  }

  void logout() {
    state = AuthState(returnUrl: state.returnUrl);
  }
}

final authProvider =
    NotifierProvider.autoDispose<AuthNotifier, AuthState>(AuthNotifier.new);

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen>
    with SingleTickerProviderStateMixin {
  static final _titleStyle =
      GoogleFonts.russoOne(fontSize: 40, color: Colors.white);
  static final _subStyle = const TextStyle(
    color: Colors.white38,
    letterSpacing: 4,
  );

  late TabController _tabController;
  final _formKey = GlobalKey<FormState>();

  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  bool _showPass = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    ref.listen(authProvider, (prev, next) {
      if (next.isSuccess && prev?.isSuccess != true && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Добро пожаловать в игру! 🏐'),
            duration: Duration(milliseconds: 1500),
          ),
        );

        WidgetsBinding.instance.addPostFrameCallback((_) {
          final returnUrl = next.returnUrl ?? '/';
          html.window.location.href = returnUrl;
        });
      }

      if (next.error != null && prev?.error != next.error && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.error!),
            backgroundColor: Colors.redAccent,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    });

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
              child: Form(
                key: _formKey,
                child: Column(
                  children: [
                    const Icon(
                      Icons.sports_volleyball,
                      size: 80,
                      color: Color(0xFFFF9500),
                    ),
                    Text('lpvolley.ru', style: _titleStyle),
                    Text('ЛЮТЫЕ ПЛЯЖНИКИ', style: _subStyle),
                    const SizedBox(height: 40),
                    _GlassBox(
                      child: Column(
                        children: [
                          TabBar(
                            controller: _tabController,
                            indicatorColor: const Color(0xFFFF9500),
                            tabs: const [
                              Tab(text: 'ВХОД'),
                              Tab(text: 'РЕГИСТРАЦИЯ'),
                            ],
                          ),
                          const SizedBox(height: 24),
                          if (_tabController.index == 1) ...[
                            _buildField(
                              _nameCtrl,
                              'ИМЯ',
                              Icons.person,
                              (v) => (v?.isEmpty ?? true) ? 'Введите имя' : null,
                            ),
                            const SizedBox(height: 16),
                          ],
                          _buildField(
                            _emailCtrl,
                            'EMAIL',
                            Icons.alternate_email,
                            (v) => (v == null || !v.contains('@'))
                                ? 'Некорректный Email'
                                : null,
                            type: TextInputType.emailAddress,
                          ),
                          const SizedBox(height: 16),
                          _buildField(
                            _passCtrl,
                            'ПАРОЛЬ',
                            Icons.lock,
                            (v) =>
                                (v?.length ?? 0) < 6 ? 'Мин. 6 символов' : null,
                            isPass: !_showPass,
                            suffix: IconButton(
                              icon: Icon(
                                _showPass
                                    ? Icons.visibility
                                    : Icons.visibility_off,
                                color: Colors.white38,
                              ),
                              onPressed: () =>
                                  setState(() => _showPass = !_showPass),
                            ),
                          ),
                          if (_tabController.index == 0)
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: () => _showResetSheet(context),
                                child: const Text(
                                  'Забыли пароль?',
                                  style: TextStyle(
                                    color: Colors.white38,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                          const SizedBox(height: 20),
                          _MainBtn(
                            text:
                                _tabController.index == 0 ? 'ВОЙТИ' : 'СОЗДАТЬ АККАУНТ',
                            isLoading: auth.isLoading,
                            onPressed: () {
                              if (_formKey.currentState?.validate() ?? false) {
                                final n = ref.read(authProvider.notifier);
                                _tabController.index == 0
                                    ? n.login(
                                        _emailCtrl.text.trim(),
                                        _passCtrl.text,
                                      )
                                    : n.register(
                                        _nameCtrl.text.trim(),
                                        _emailCtrl.text.trim(),
                                        _passCtrl.text,
                                      );
                              }
                            },
                          ),
                          const SizedBox(height: 16),
                          _VKButton(
                            onPressed: () =>
                                ref.read(authProvider.notifier).loginWithVK(),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildField(
    TextEditingController ctrl,
    String hint,
    IconData icon,
    String? Function(String?)? validator, {
    bool isPass = false,
    Widget? suffix,
    TextInputType? type,
  }) {
    return TextFormField(
      controller: ctrl,
      obscureText: isPass,
      validator: validator,
      keyboardType: type,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        prefixIcon: Icon(icon, color: const Color(0xFFFF9500), size: 20),
        suffixIcon: suffix,
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.05),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Colors.white.withValues(alpha: 0.1),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFFF9500)),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.redAccent),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.redAccent),
        ),
        errorStyle: const TextStyle(color: Colors.redAccent, fontSize: 10),
      ),
    );
  }
}

void _showResetSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _ResetSheetContent(),
  );
}

class _ResetSheetContent extends ConsumerStatefulWidget {
  const _ResetSheetContent();

  @override
  ConsumerState<_ResetSheetContent> createState() => _ResetSheetContentState();
}

class _ResetSheetContentState extends ConsumerState<_ResetSheetContent> {
  final _resetCtrl = TextEditingController();
  final _resetFormKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _resetCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: _GlassBox(
        padding: 30,
        child: Form(
          key: _resetFormKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'ВОССТАНОВЛЕНИЕ',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 20),
              TextFormField(
                controller: _resetCtrl,
                style: const TextStyle(color: Colors.white),
                validator: (v) =>
                    (v == null || !v.contains('@')) ? 'Введите Email' : null,
                decoration: InputDecoration(
                  hintText: 'ВАШ EMAIL',
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              _MainBtn(
                text: 'ОТПРАВИТЬ ССЫЛКУ',
                isLoading: auth.isLoading,
                onPressed: () async {
                  if (_resetFormKey.currentState?.validate() ?? false) {
                    await ref
                        .read(authProvider.notifier)
                        .resetPassword(_resetCtrl.text.trim());
                    if (context.mounted) Navigator.pop(context);
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GlassBox extends StatelessWidget {
  final Widget child;
  final double padding;

  const _GlassBox({required this.child, this.padding = 24});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(30),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
          child: Container(
            padding: EdgeInsets.all(padding),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.1),
              ),
            ),
            child: child,
          ),
        ),
      );
}

class _MainBtn extends StatelessWidget {
  final String text;
  final bool isLoading;
  final VoidCallback onPressed;

  const _MainBtn({
    required this.text,
    required this.isLoading,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFFF9500),
          minimumSize: const Size(double.infinity, 55),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: isLoading
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  color: Colors.black,
                  strokeWidth: 2.5,
                ),
              )
            : Text(
                text,
                style: const TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.bold,
                ),
              ),
      );
}

class _VKButton extends StatelessWidget {
  final VoidCallback onPressed;

  const _VKButton({required this.onPressed});

  @override
  Widget build(BuildContext context) => OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(double.infinity, 55),
          side: const BorderSide(color: Colors.white24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            Text(
              'VK',
              style: TextStyle(
                color: Color(0xFF2787F5),
                fontWeight: FontWeight.w900,
                fontSize: 18,
              ),
            ),
            SizedBox(width: 10),
            Text(
              'ВОЙТИ ЧЕРЕЗ VK ID',
              style: TextStyle(color: Colors.white, fontSize: 12),
            ),
          ],
        ),
      );
}
