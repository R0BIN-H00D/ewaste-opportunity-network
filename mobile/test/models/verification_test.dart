import 'package:ewaste_opportunity/models/verification.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

void main() {
  test('a verification reads its status, reason, allowed kinds and documents', () {
    final v = VerificationStatus.fromJson(verificationJson(status: 'rejected', reason: 'Blurry', documents: [verificationDocJson(status: 'rejected', reason: 'Too dark')]));
    expect(v.status, 'rejected');
    expect(v.reason, 'Blurry');
    expect(v.allowedDocTypes, ['id_proof', 'qualification', 'other']);
    expect(v.documents.single.fileName, 'id.jpg');
    expect(v.documents.single.reason, 'Too dark');
    expect(v.documents.single.submittedAt, isNotNull);
    expect(v.canAddDocuments, isTrue);
  });

  test('an approved provider cannot add documents, and approved ones cannot be removed', () {
    final v = VerificationStatus.fromJson(verificationJson(status: 'approved', documents: [verificationDocJson(status: 'approved')]));
    expect(v.isApproved, isTrue);
    expect(v.canAddDocuments, isFalse);
    expect(v.documents.single.isApproved, isTrue);
  });

  test('missing fields fall back to safe values', () {
    final v = VerificationStatus.fromJson(const {});
    expect(v.status, 'not_submitted');
    expect(v.documents, isEmpty);
    expect(v.allowedDocTypes, isEmpty);
  });
}
