import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/learning_validation.dart';
import '../../core/network/api_exception.dart';
import '../../models/learning.dart';
import '../../models/listing.dart' show Category;
import '../../providers/learning_providers.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../services/learning_repository.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// Post a supervised task for students, or change one. Give [opportunityId] to edit.
class OpportunityFormScreen extends ConsumerWidget {
  const OpportunityFormScreen({super.key, this.opportunityId});

  final String? opportunityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final editing = opportunityId != null;
    final AsyncValue<List<Category>> categories = ref.watch(categoriesProvider);
    final AsyncValue<Opportunity?> task = editing ? ref.watch(opportunityProvider(opportunityId!)) : const AsyncData<Opportunity?>(null);
    final error = categories.error ?? task.error;
    final ready = categories.hasValue && task.hasValue;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, editing ? 'Edit task' : 'Post a task'),
      body: AppBackground(
        child: SafeArea(
          child: error != null
              ? ListView(padding: const EdgeInsets.all(20), children: [
                  ErrorState(
                    error: ApiException.from(error),
                    onRetry: () {
                      ref.invalidate(categoriesProvider);
                      if (editing) ref.invalidate(opportunityProvider(opportunityId!));
                    },
                  ),
                ])
              : !ready
                  ? ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 56, radius: 16), SizedBox(height: 12), Skeleton(height: 120, radius: 16)])
                  : _Form(categories: categories.requireValue, task: task.valueOrNull is Opportunity ? task.value as Opportunity : null),
        ),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.categories, this.task});

  final List<Category> categories;
  final Opportunity? task;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  final _formKey = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.task?.title ?? '');
  late final _description = TextEditingController(text: widget.task?.description ?? '');
  late final _skills = TextEditingController(text: widget.task?.skills.join(', ') ?? '');
  late final _area = TextEditingController(text: widget.task?.locationArea ?? '');
  late final _seats = TextEditingController(text: '${widget.task?.seats ?? 1}');
  late final _hours = TextEditingController(text: widget.task?.expectedHours == null ? '' : _plain(widget.task!.expectedHours!));
  late String? _category = _categoryIdOf(widget.task);
  late String _difficulty = widget.task?.difficulty ?? 'beginner';
  late DateTime? _deadline = widget.task?.deadline;
  bool _acknowledged = false;
  bool _busy = false;
  String? _error;
  String? _deadlineError;

  bool get _editing => widget.task != null;

  static String _plain(double v) => v == v.roundToDouble() ? v.round().toString() : v.toString();

  String? _categoryIdOf(Opportunity? t) {
    final id = t?.categoryId;
    return id != null && widget.categories.any((c) => c.id == id) ? id : null;
  }

  @override
  void dispose() {
    for (final c in [_title, _description, _skills, _area, _seats, _hours]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDeadline() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _deadline != null && _deadline!.isAfter(now) ? _deadline! : now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      helpText: 'Apply by',
    );
    if (picked == null) return;
    // The end of that day, so students can still apply on it.
    setState(() {
      _deadline = DateTime(picked.year, picked.month, picked.day, 23, 59);
      _deadlineError = null;
    });
  }

  Future<void> _save() async {
    setState(() => _error = null);
    final valid = _formKey.currentState!.validate();
    String? deadlineProblem;
    if (_deadline == null) {
      deadlineProblem = 'Choose the last day students can apply';
    } else if (!_deadline!.isAfter(DateTime.now())) {
      deadlineProblem = 'The deadline must be in the future';
    }
    setState(() => _deadlineError = deadlineProblem);
    if (!valid || deadlineProblem != null) return;
    if (!_editing && !_acknowledged) {
      setState(() => _error = 'Confirm that you will supervise and that no hazardous handling is involved');
      return;
    }
    setState(() => _busy = true);
    try {
      final repo = ref.read(learningRepositoryProvider);
      final input = OpportunityInput(
        title: _title.text,
        description: _description.text,
        deviceTypeId: _category,
        requiredSkills: parseSkills(_skills.text).skills,
        difficulty: _difficulty,
        locationArea: _area.text,
        deadline: _deadline,
        seats: int.tryParse(_seats.text.trim()),
        expectedHours: double.tryParse(_hours.text.trim()),
        supervisionAcknowledged: _acknowledged,
      );
      final saved = _editing ? await repo.updateOpportunity(widget.task!.id, input) : await repo.createOpportunity(input);
      ref.invalidate(myTasksProvider);
      ref.invalidate(opportunitiesProvider);
      ref.invalidate(opportunityProvider(saved.id));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_editing ? 'Task saved' : 'Task posted. Verified students can now apply.')));
      if (_editing) {
        context.canPop() ? context.pop() : context.go(Routes.myTasks);
      } else {
        context.pushReplacement(Routes.opportunity(saved.id));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppTextField(controller: _title, label: 'Task title', icon: Icons.school_outlined, validator: validateTaskTitle),
                const SizedBox(height: 12),
                AppTextField(controller: _description, label: 'What will the student do? (optional)', maxLines: 4, validator: validateTaskDescription),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Type of device'),
                  items: [for (final c in widget.categories) DropdownMenuItem(value: c.id, child: Text(c.name))],
                  validator: (v) => v == null ? 'Choose the type of device' : null,
                  onChanged: (v) => setState(() => _category = v),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _difficulty,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Level'),
                  items: [for (final (value, label) in difficulties) DropdownMenuItem(value: value, child: Text(label))],
                  onChanged: (v) => setState(() => _difficulty = v ?? 'beginner'),
                ),
                const SizedBox(height: 12),
                AppTextField(controller: _skills, label: 'Skills (optional, separated by commas)', validator: validateSkills),
                const SizedBox(height: 12),
                AppTextField(controller: _area, label: 'Area or locality', icon: Icons.place_outlined, validator: validateTaskArea),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _pickDeadline,
                  icon: const Icon(Icons.event_outlined),
                  label: Text(_deadline == null ? 'Choose the last day to apply' : 'Apply by ${formatDate(_deadline)}'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                ),
                if (_deadlineError != null) Padding(padding: const EdgeInsets.only(top: 6, left: 12), child: Text(_deadlineError!, style: TextStyle(color: theme.colorScheme.error, fontSize: 12))),
                const SizedBox(height: 12),
                AppTextField(controller: _seats, label: 'How many students', keyboardType: TextInputType.number, validator: validateSeats),
                const SizedBox(height: 12),
                AppTextField(controller: _hours, label: 'Expected hours (optional)', keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: validateExpectedHours),
              ],
            ),
          ),
          if (!_editing) ...[
            const SizedBox(height: 16),
            GlassContainer(
              child: Material(
                type: MaterialType.transparency,
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _acknowledged,
                  onChanged: (v) => setState(() => _acknowledged = v ?? false),
                  title: const Text('I will supervise the student throughout, and this task involves no hazardous handling.'),
                ),
              ),
            ),
          ],
          if (_error != null) ...[const SizedBox(height: 16), MessageBanner(message: _error!, tone: BannerTone.error)],
          const SizedBox(height: 16),
          LoadingButton(label: _editing ? 'Save changes' : 'Post task', icon: Icons.check, loading: _busy, onPressed: _save),
        ],
      ),
    );
  }
}
