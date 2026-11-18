/// The five roles of the platform. Names match the API's `role` values exactly.
enum UserRole { user, technician, refurbisher, recycler, admin }

UserRole roleFrom(String? value) => UserRole.values
    .firstWhere((r) => r.name == value, orElse: () => UserRole.user);

extension UserRoleX on UserRole {
  /// Provider roles must be approved by an administrator before they can offer services (BR-01).
  bool get isProvider =>
      this == UserRole.technician ||
      this == UserRole.refurbisher ||
      this == UserRole.recycler;

  /// Roles that give an organisation name when they register.
  bool get needsOrganization =>
      this == UserRole.refurbisher || this == UserRole.recycler;

  String get label {
    switch (this) {
      case UserRole.user:
        return 'Member';
      case UserRole.technician:
        return 'Technician';
      case UserRole.refurbisher:
        return 'Refurbisher';
      case UserRole.recycler:
        return 'Recycling centre';
      case UserRole.admin:
        return 'Administrator';
    }
  }

  /// One line for the role picker on the registration screen.
  String get blurb {
    switch (this) {
      case UserRole.user:
        return 'List old devices, get them repaired, donated, refurbished or recycled.';
      case UserRole.technician:
        return 'Offer repair and diagnosis services near you.';
      case UserRole.refurbisher:
        return 'Restore devices and sell them with honest labels.';
      case UserRole.recycler:
        return 'Collect devices and record the materials you recover.';
      case UserRole.admin:
        return 'Administration is available on the web.';
    }
  }
}

/// Roles a person can choose when registering (administrators are never self-registered).
const registrationRoles = [
  UserRole.user,
  UserRole.technician,
  UserRole.refurbisher,
  UserRole.recycler
];

class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    required this.emailVerified,
    this.phone,
    this.avatarUrl,
  });

  final String id;
  final String name;
  final String email;
  final UserRole role;

  /// `active`, `pending_verification` or `suspended`.
  final String status;
  final bool emailVerified;
  final String? phone;
  final String? avatarUrl;

  bool get isPendingVerification => status == 'pending_verification';

  String get firstName {
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts.isEmpty || parts.first.isEmpty ? name : parts.first;
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    final avatar = json['avatar'];
    return AppUser(
      id: json['_id'] as String,
      name: (json['name'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      role: roleFrom(json['role'] as String?),
      status: (json['status'] as String?) ?? 'active',
      emailVerified: (json['emailVerified'] as bool?) ?? false,
      phone: json['phone'] as String?,
      avatarUrl: avatar is Map ? avatar['url'] as String? : null,
    );
  }
}

/// What a login, registration or refresh returns.
class Session {
  const Session(
      {required this.user,
      required this.accessToken,
      required this.refreshToken,
      required this.expiresIn});

  final AppUser user;
  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory Session.fromJson(Map<String, dynamic> json) {
    final refresh = json['refreshToken'];
    if (refresh is! String)
      throw const FormatException('The session has no refresh token');
    return Session(
      user: AppUser.fromJson((json['user'] as Map).cast<String, dynamic>()),
      accessToken: json['accessToken'] as String,
      refreshToken: refresh,
      expiresIn: (json['expiresIn'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Everything the app needs after signing in: `GET /api/auth/me`.
class Me {
  const Me({required this.user, this.verificationStatus});

  final AppUser user;

  /// For provider roles: `not_submitted`, `pending`, `approved`, `rejected` or `resubmission_required`.
  final String? verificationStatus;

  Me copyWith({AppUser? user}) =>
      Me(user: user ?? this.user, verificationStatus: verificationStatus);

  factory Me.fromJson(Map<String, dynamic> json) {
    final verification = json['verification'];
    return Me(
      user: AppUser.fromJson((json['user'] as Map).cast<String, dynamic>()),
      verificationStatus:
          verification is Map ? verification['status'] as String? : null,
    );
  }
}
