/// API base URL is injected at build/run time:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api
/// (10.0.2.2 = host machine as seen from the Android emulator)
class AppConstants {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000/api',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://10.0.2.2:5000',
  );
  static const appName = 'E-Waste Network';
}
