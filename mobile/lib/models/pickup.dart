/// One collection window on one day, and whether it can still be chosen. Mirrors `GET /api/pickups/slots`.
class PickupSlot {
  const PickupSlot(
      {required this.key,
      required this.label,
      required this.start,
      required this.available,
      this.reason});

  /// "10:00-12:00": what is sent back as the pickup's `timeSlot`.
  final String key;

  /// "Late morning".
  final String label;

  /// When the window starts (the date sent when booking).
  final DateTime start;
  final bool available;

  /// Why it is closed: `too_soon` (starts in under two hours) or `busy` (the person is already booked then).
  final String? reason;

  factory PickupSlot.fromJson(Map<String, dynamic> json) => PickupSlot(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        start: DateTime.tryParse(json['start'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        available: json['available'] == true,
        reason: json['reason'] as String?,
      );

  /// "8-10 am", "11 am-1 pm": the window as people say it.
  String get hours {
    final parts = key.split('-');
    if (parts.length != 2) return key;
    final a = int.tryParse(parts[0].split(':').first);
    final b = int.tryParse(parts[1].split(':').first);
    if (a == null || b == null) return key;
    String h(int n) => '${n % 12 == 0 ? 12 : n % 12}';
    String ap(int n) => n < 12 ? 'am' : 'pm';
    return ap(a) == ap(b)
        ? '${h(a)}-${h(b)} ${ap(b)}'
        : '${h(a)} ${ap(a)}-${h(b)} ${ap(b)}';
  }
}

/// A calendar day (in India) and its windows.
class SlotDay {
  const SlotDay({required this.date, required this.slots});

  /// `YYYY-MM-DD`.
  final String date;
  final List<PickupSlot> slots;

  bool get hasOpen => slots.any((s) => s.available);

  DateTime? get day => DateTime.tryParse(date);

  factory SlotDay.fromJson(Map<String, dynamic> json) => SlotDay(
        date: json['date'] as String? ?? '',
        slots: [
          for (final s in (json['slots'] as List? ?? const []))
            if (s is Map) PickupSlot.fromJson(s.cast<String, dynamic>())
        ],
      );
}

class SlotCatalogue {
  const SlotCatalogue(
      {required this.days, this.cutoffHours = 2, this.maxReschedules = 3});

  final List<SlotDay> days;
  final int cutoffHours;
  final int maxReschedules;

  factory SlotCatalogue.fromJson(Map<String, dynamic> json) => SlotCatalogue(
        days: [
          for (final d in (json['days'] as List? ?? const []))
            if (d is Map) SlotDay.fromJson(d.cast<String, dynamic>())
        ],
        cutoffHours: (json['cutoffHours'] as num?)?.toInt() ?? 2,
        maxReschedules: (json['maxReschedules'] as num?)?.toInt() ?? 3,
      );
}

/// What the person picked: the window's start and its key.
class PickupChoice {
  const PickupChoice({required this.date, this.slot});

  final DateTime date;
  final String? slot;
}

/// A pickup, collection or handover the person is part of. Mirrors one item of `GET /api/pickups`.
class PickupItem {
  const PickupItem({
    required this.id,
    required this.kind,
    required this.contextId,
    required this.title,
    required this.date,
    required this.status,
    this.timeSlot = '',
    this.notes = '',
    this.addressArea = '',
    this.rescheduleCount = 0,
    this.reschedulesLeft = 3,
    this.changeableUntil,
    this.canChange = false,
    this.asRequester = true,
    this.counterpartName = '',
    this.awaitingMe = false,
    this.proposedByMe = false,
  });

  final String id;

  /// `repair`, `donation`, `refurbishment` or `recycling`.
  final String kind;
  final String contextId;
  final String title;
  final DateTime? date;
  final String status;
  final String timeSlot;
  final String notes;
  final String addressArea;
  final int rescheduleCount;
  final int reschedulesLeft;
  final DateTime? changeableUntil;
  final bool canChange;
  final bool asRequester;
  final String counterpartName;

  /// The other side set or changed this time and it waits for this person to confirm it (or to suggest another).
  final bool awaitingMe;

  /// This person set or changed the time and is waiting for the other side.
  final bool proposedByMe;

  factory PickupItem.fromJson(Map<String, dynamic> json) {
    final other = json['counterpart'];
    return PickupItem(
      id: (json['_id'] ?? '').toString(),
      kind: json['kind'] as String? ?? '',
      contextId: (json['contextId'] ?? '').toString(),
      title: json['title'] as String? ?? 'Pickup',
      date: DateTime.tryParse(json['date'] as String? ?? ''),
      status: json['status'] as String? ?? '',
      timeSlot: json['timeSlot'] as String? ?? '',
      notes: json['notes'] as String? ?? '',
      addressArea: json['addressArea'] as String? ?? '',
      rescheduleCount: (json['rescheduleCount'] as num?)?.toInt() ?? 0,
      reschedulesLeft: (json['reschedulesLeft'] as num?)?.toInt() ?? 0,
      changeableUntil:
          DateTime.tryParse(json['changeableUntil'] as String? ?? ''),
      canChange: json['canChange'] == true,
      asRequester: json['viewerRole'] != 'provider',
      counterpartName: other is Map ? (other['name'] as String? ?? '') : '',
      awaitingMe: json['awaitingMe'] == true,
      proposedByMe: json['proposedByMe'] == true,
    );
  }
}
