/// One document a provider has sent for approval. The server never reveals where the file is kept.
class VerificationDoc {
  const VerificationDoc({required this.id, required this.docType, required this.status, this.reason, this.submittedAt, this.fileName, this.bytes});

  final String id;
  final String docType;
  final String status;

  /// Why an administrator did not accept it.
  final String? reason;
  final DateTime? submittedAt;
  final String? fileName;
  final int? bytes;

  bool get isApproved => status == 'approved';

  factory VerificationDoc.fromJson(Map<String, dynamic> json) {
    final file = json['file'];
    return VerificationDoc(
      id: json['_id'] as String,
      docType: (json['docType'] as String?) ?? 'other',
      status: (json['status'] as String?) ?? 'pending',
      reason: json['reason'] as String?,
      submittedAt: json['submittedAt'] is String ? DateTime.tryParse(json['submittedAt'] as String) : null,
      fileName: file is Map ? file['originalName'] as String? : null,
      bytes: file is Map ? (file['bytes'] as num?)?.toInt() : null,
    );
  }
}

/// A provider's verification: the overall decision, the reason if it was not approved, what they may send, and what they sent.
class VerificationStatus {
  const VerificationStatus({required this.status, this.reason, this.allowedDocTypes = const [], this.documents = const []});

  final String status;
  final String? reason;
  final List<String> allowedDocTypes;
  final List<VerificationDoc> documents;

  bool get isApproved => status == 'approved';
  bool get canAddDocuments => !isApproved;

  factory VerificationStatus.fromJson(Map<String, dynamic> json) {
    final allowed = json['allowedDocTypes'];
    final docs = json['documents'];
    return VerificationStatus(
      status: (json['status'] as String?) ?? 'not_submitted',
      reason: json['reason'] as String?,
      allowedDocTypes: allowed is List ? [for (final t in allowed) if (t is String) t] : const [],
      documents: docs is List ? [for (final d in docs) if (d is Map) VerificationDoc.fromJson(d.cast<String, dynamic>())] : const [],
    );
  }
}
