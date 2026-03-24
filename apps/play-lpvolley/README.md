# play-lpvolley (Flutter Web/PWA)

## Local run

```bash
cd apps/play-lpvolley
flutter pub get
flutter run -d chrome
```

## Release build (CanvasKit)

```bash
cd apps/play-lpvolley
flutter build web --web-renderer canvaskit --release --source-maps
```

Build output will be in `build/web`.
