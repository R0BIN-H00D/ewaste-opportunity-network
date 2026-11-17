import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/ai_repository.dart';
import 'core_providers.dart';

final aiRepositoryProvider = Provider<AiRepository>((ref) => AiRepository(ref.watch(apiClientProvider)));