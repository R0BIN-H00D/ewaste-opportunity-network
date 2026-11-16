/// The note a student may send with an application (optional, up to 500 characters). Mirrors `learning.validators.js`.
String? validateApplicationMessage(String? value) => (value ?? '').trim().length > 500 ? 'Please keep this under 500 characters' : null;

/// Checks for the supervising technician's forms. They mirror `learning.validators.js`.
String? validateTaskTitle(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 5) return 'Give the task a clear title';
  if (text.length > 140) return 'Please keep this under 140 characters';
  return null;
}

String? validateTaskDescription(String? value) => (value ?? '').trim().length > 2000 ? 'Please keep this under 2000 characters' : null;

String? validateTaskArea(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter the area or locality';
  if (text.length > 100) return 'Please keep this under 100 characters';
  return null;
}

String? validateSeats(String? value) {
  final n = int.tryParse((value ?? '').trim());
  if (n == null) return 'Enter how many students you can take';
  if (n < 1 || n > 20) return 'Between 1 and 20 students';
  return null;
}

/// Optional: how long the task should take.
String? validateExpectedHours(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null;
  final n = double.tryParse(text);
  if (n == null) return 'Enter the hours as a number';
  if (n < 1 || n > 200) return 'Between 1 and 200 hours';
  return null;
}

/// The hours a student actually worked, recorded when the task is finished.
String? validateHoursWorked(String? value) {
  final n = double.tryParse((value ?? '').trim());
  if (n == null) return 'Enter the hours as a number';
  if (n < 0.5) return 'Record at least half an hour';
  if (n > 200) return 'That is more than 200 hours';
  return null;
}

String? validateFeedback(String? value) => (value ?? '').trim().length > 1000 ? 'Please keep this under 1000 characters' : null;

/// Skills typed as "soldering, testing". Lower-cased, de-duplicated, at most 10 of up to 40 characters.
({List<String> skills, String? error}) parseSkills(String? text) {
  final seen = <String>{};
  final skills = <String>[];
  for (final part in (text ?? '').split(',')) {
    final skill = part.trim().toLowerCase();
    if (skill.isEmpty) continue;
    if (skill.length > 40) return (skills: const [], error: 'A skill can be at most 40 characters');
    if (seen.add(skill)) skills.add(skill);
  }
  if (skills.length > 10) return (skills: const [], error: 'At most 10 skills');
  return (skills: skills, error: null);
}

String? validateSkills(String? text) => parseSkills(text).error;
