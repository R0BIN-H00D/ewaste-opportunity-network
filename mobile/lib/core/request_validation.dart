const maxIssueLength = 2000;

/// The problem description for a repair request (3 to 2000 characters, as the server expects).
String? validateIssue(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Tell the technician what is wrong';
  if (text.length < 3) return 'Describe the problem in a few words';
  if (text.length > maxIssueLength) return 'Please keep this under $maxIssueLength characters';
  return null;
}

/// The reason for declining a quote: required, at least 3 characters (the server refuses a decline without one).
String? validateDeclineReason(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3) return 'Please give a short reason';
  if (text.length > 500) return 'Please keep this under 500 characters';
  return null;
}
