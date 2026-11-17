import 'dart:async';
import 'dart:typed_data';
import 'package:ewaste_opportunity/services/certificate_saver.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/models/chat.dart';
import 'package:ewaste_opportunity/models/impact.dart';
import 'package:ewaste_opportunity/services/impact_repository.dart';
import 'package:ewaste_opportunity/models/pickup.dart';
import 'package:ewaste_opportunity/services/pickup_repository.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/services/chat_repository.dart';
import 'package:ewaste_opportunity/services/realtime_service.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/donation.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/learning.dart';
import 'package:ewaste_opportunity/models/refurbishment.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/models/marketplace.dart';
import 'package:ewaste_opportunity/models/page_result.dart';
import 'package:ewaste_opportunity/models/recycling.dart';
import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/models/technician.dart';
import 'package:ewaste_opportunity/models/verification.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/donation_repository.dart';
import 'package:ewaste_opportunity/services/learning_repository.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/services/marketplace_repository.dart';
import 'package:ewaste_opportunity/services/refurbishment_repository.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/services/recycling_repository.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/services/technician_repository.dart';
import 'package:ewaste_opportunity/services/verification_repository.dart';
import 'models/donation_models_test.dart';
import 'models/learning_models_test.dart';
import 'models/refurbishment_models_test.dart';
import 'models/listing_test.dart';
import 'models/marketplace_models_test.dart';
import 'models/recycling_models_test.dart';
import 'models/request_models_test.dart';

Listing sampleListing({String id = 'l1', String title = 'Old Samsung phone', bool isOwner = false, String status = 'listed'}) =>
    Listing.fromJson({...listingJson(id: id, isOwner: isOwner, status: status), 'title': title, 'device': {'name': title, 'photos': []}});

/// A [DeviceRepository] that never touches the network. Answers come from [pages] (page number -> items).
class FakeDeviceRepository extends DeviceRepository {
  FakeDeviceRepository({this.pages = const {}, this.pageCount = 1, this.error, this.categoryList = const []})
      : super(ApiClient(store: MemoryKeyValueStore()));

  Map<int, List<Listing>> pages;
  int pageCount;
  ApiException? error;
  List<Category> categoryList;

  final queries = <ListingQuery>[];
  final created = <ListingInput>[];
  final createdPhotos = <List<PickedPhoto>>[];
  ApiException? createError;
  String? removed;

  @override
  Future<ListingPage> list(ListingQuery query) async {
    queries.add(query);
    final e = error;
    if (e != null) throw e;
    final items = pages[query.page] ?? const <Listing>[];
    return ListingPage(items: items, page: query.page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<Listing> get(String id) async => sampleListing(id: id, isOwner: true);

  @override
  Future<List<Category>> categories() async => categoryList;

  @override
  Future<Listing> create(ListingInput input, List<PickedPhoto> photos, {void Function(double progress)? onProgress}) async {
    final e = createError;
    if (e != null) throw e;
    created.add(input);
    createdPhotos.add(photos);
    onProgress?.call(1);
    return sampleListing(id: 'new1', title: input.name, isOwner: true);
  }

  @override
  Future<void> remove(String id) async {
    removed = id;
  }
}

Conversation sampleConversation({String id = 'c1', String other = 'Ravi Kumar', String contextType = 'service', int unread = 0, String? lastText, bool lastMine = false}) => Conversation(
      id: id,
      contextType: contextType,
      contextId: 'ctx-$id',
      otherId: 'u2',
      otherName: other,
      otherRole: 'technician',
      lastText: lastText,
      lastAt: lastText == null ? null : DateTime.now(),
      lastMine: lastMine,
      unread: unread,
      updatedAt: DateTime.now(),
    );

ChatMessage sampleMessage(String id, String text, {String sender = 'u2', String conversation = 'c1', bool read = false, DateTime? at}) =>
    ChatMessage(id: id, conversationId: conversation, senderId: sender, text: text, createdAt: at ?? DateTime(2026, 11, 16, 9, int.tryParse(id.replaceAll(RegExp(r'\D'), '')) ?? 0), read: read);

Map<String, dynamic> greenScoreJson({int score = 92, String level = 'seed', double progress = 0.92, bool withLedger = true, List<Map<String, dynamic>>? badges}) => {
      'score': score,
      'level': {'key': level, 'name': level == 'seed' ? 'Seed' : 'Sprout', 'min': level == 'seed' ? 0 : 100, 'next': level == 'seed' ? {'key': 'sprout', 'name': 'Sprout', 'min': 100} : {'key': 'sapling', 'name': 'Sapling', 'min': 250}, 'progress': progress},
      'badges': badges ??
          [
            {'key': 'first_repair', 'name': 'First repair', 'description': 'Take part in one completed repair.', 'earned': true, 'progress': {'done': 1, 'needed': 1}},
            {'key': 'donor', 'name': 'Donor', 'description': 'Donate one device.', 'earned': false, 'progress': {'done': 0, 'needed': 1}},
            {'key': 'material_saver', 'name': 'Material saver', 'description': 'Have 10 kg of materials measured on a scale at a recycling centre.', 'earned': false, 'progress': {'done': 2.5, 'needed': 10}},
          ],
      'ledger': withLedger
          ? [
              {'_id': 'l2', 'eventRef': 'donation:d1', 'points': 40, 'rule': 'donation_completed', 'label': 'You donated a device', 'createdAt': '2026-11-16T09:00:00.000Z'},
              {'_id': 'l1', 'eventRef': 'repair:r1', 'points': 50, 'rule': 'repair_completed', 'label': 'A repair you asked for was completed', 'createdAt': '2026-11-15T09:00:00.000Z'},
            ]
          : [],
    };

Map<String, dynamic> impactJson({int devices = 3, double measured = 1.5, double estimated = 2, double co2e = 150}) => {
      'events': 2,
      'devices': {'total': devices, 'byType': {'repair': 1, 'reuse': 0, 'donation': 2, 'refurbishment': 0, 'recycling': 0}},
      'materials': {'measuredKg': measured, 'estimatedKg': estimated},
      'co2e': {'kgEstimated': co2e, 'isEstimate': true},
      'factorsProvisional': true,
      'method': 'Counts of devices are actual. Everything else is an estimate from placeholder factors.',
    };

/// An [ImpactRepository] that never touches the network. The first page of the ledger comes from [score].
/// A day of windows the way the server sends them: [open] says which of the five can be chosen.
Map<String, dynamic> slotDayJson(String date, {Set<int> open = const {0, 1, 2, 3, 4}, Set<int> busy = const {}}) {
  const keys = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'];
  const labels = ['Morning', 'Late morning', 'Midday', 'Afternoon', 'Evening'];
  return {
    'date': date,
    'slots': [
      for (var i = 0; i < 5; i++)
        {
          'key': keys[i],
          'label': labels[i],
          'start': DateTime.utc(int.parse(date.substring(0, 4)), int.parse(date.substring(5, 7)), int.parse(date.substring(8, 10)), 2 + i * 2, 30).toIso8601String(),
          'available': open.contains(i) && !busy.contains(i),
          if (!open.contains(i)) 'reason': 'too_soon' else if (busy.contains(i)) 'reason': 'busy',
        },
    ],
  };
}

Map<String, dynamic> pickupJson({String id = 'pk1', String kind = 'repair', String title = 'Dell Inspiron', String status = 'confirmed', DateTime? date, String timeSlot = '10:00-12:00', int count = 0, bool canChange = true, String viewer = 'requester'}) => {
      '_id': id,
      'kind': kind,
      'contextId': 'ctx-$id',
      'title': title,
      'date': (date ?? DateTime.now().add(const Duration(days: 3))).toUtc().toIso8601String(),
      'timeSlot': timeSlot,
      'notes': '',
      'addressArea': 'Indiranagar',
      'status': status,
      'rescheduleCount': count,
      'reschedulesLeft': 3 - count,
      'changeableUntil': (date ?? DateTime.now().add(const Duration(days: 3))).subtract(const Duration(hours: 2)).toUtc().toIso8601String(),
      'canChange': canChange,
      'viewerRole': viewer,
      'counterpart': {'_id': 'u2', 'name': 'Ravi Kumar'},
    };

class FakePickupRepository extends PickupRepository {
  FakePickupRepository({List<Map<String, dynamic>>? days, List<Map<String, dynamic>>? upcoming, List<Map<String, dynamic>>? past})
      : catalogue = SlotCatalogue.fromJson({'days': days ?? [slotDayJson('2026-11-18'), slotDayJson('2026-11-19', busy: {1})], 'cutoffHours': 2, 'maxReschedules': 3}),
        upcomingJson = upcoming ?? [pickupJson()],
        pastJson = past ?? const [],
        super(ApiClient(store: MemoryKeyValueStore()));

  SlotCatalogue catalogue;
  List<Map<String, dynamic>> upcomingJson;
  List<Map<String, dynamic>> pastJson;
  ApiException? slotsError;
  ApiException? listError;
  int slotCalls = 0;
  final asked = <bool>[];

  @override
  Future<SlotCatalogue> slots() async {
    slotCalls++;
    final e = slotsError;
    if (e != null) throw e;
    return catalogue;
  }

  @override
  Future<PageResult<PickupItem>> list({bool upcoming = true, int page = 1}) async {
    asked.add(upcoming);
    final e = listError;
    if (e != null) throw e;
    final rows = [for (final j in (upcoming ? upcomingJson : pastJson)) PickupItem.fromJson(j)];
    return PageResult(items: rows, page: 1, pages: 1, total: rows.length);
  }
}
class FakeImpactRepository extends ImpactRepository {
  FakeImpactRepository({Map<String, dynamic>? score, Map<String, dynamic>? summary, List<Map<String, dynamic>>? months, this.ledgerPages = 1})
      : score = GreenScore.fromJson(score ?? greenScoreJson()),
        summaryData = ImpactSummary.fromJson(summary ?? impactJson()),
        monthList = [for (final m in months ?? defaultMonths()) MonthImpact.fromJson(m)],
        super(ApiClient(store: MemoryKeyValueStore()));

  GreenScore score;
  ImpactSummary summaryData;
  List<MonthImpact> monthList;
  int ledgerPages;
  ApiException? error;
  int scoreCalls = 0;
  final pagesAsked = <int>[];

  static List<Map<String, dynamic>> defaultMonths() => [
        {'month': '2026-09', 'devices': 0, 'byType': {}},
        {'month': '2026-10', 'devices': 1, 'byType': {'repair': 1}},
        {'month': '2026-11', 'devices': 2, 'byType': {'donation': 2}},
      ];

  @override
  Future<({GreenScore score, PageResult<LedgerEntry> ledger})> greenScore({int page = 1}) async {
    final e = error;
    if (e != null) throw e;
    scoreCalls++;
    pagesAsked.add(page);
    final items = page == 1 ? score.ledger : [LedgerEntry(id: 'p$page', points: 5, label: 'Older entry $page', rule: 'review_left', at: DateTime(2026, 10, 1))];
    return (score: score, ledger: PageResult(items: items, page: page, pages: ledgerPages, total: 2));
  }

  @override
  Future<ImpactSummary> summary() async {
    final e = error;
    if (e != null) throw e;
    return summaryData;
  }

  @override
  Future<List<MonthImpact>> monthly({int months = 12}) async {
    final e = error;
    if (e != null) throw e;
    return monthList;
  }

  @override
  Future<ScoringRules> rules() async => const ScoringRules(
        rules: [ScoringRule(key: 'repair_completed', points: 50, label: 'A repair you asked for was completed', who: 'the person who asked')],
        dailyCap: 10,
        notes: ['Points come only from activities the other side has confirmed as done.'],
        method: 'Counts of devices are actual. Everything else is an estimate.',
      );
}

/// A [ChatRepository] that never touches the network. Threads live in [thread] (oldest first); the signed-in test user is `u1`.
class FakeChatRepository extends ChatRepository {
  FakeChatRepository() : super(ApiClient(store: MemoryKeyValueStore()));

  List<Conversation> conversationList = [];
  final Map<String, List<ChatMessage>> thread = {};
  int unreadCount = 0;
  int pageSize = 30;
  ApiException? sendError;
  ApiException? openError;
  ApiException? messagesError;
  Conversation? openResult;

  /// While set, [send] waits for it, so a test can act while a message is still "sending".
  Completer<void>? sendGate;

  final sent = <(String, String)>[];
  final opened = <(String, String)>[];
  final marked = <String>[];
  int _n = 100;

  @override
  Future<Conversation> open(String contextType, String contextId) async {
    final e = openError;
    if (e != null) throw e;
    opened.add((contextType, contextId));
    return openResult ?? sampleConversation(id: 'opened', contextType: contextType);
  }

  @override
  Future<({PageResult<Conversation> page, int unread})> conversations({int page = 1}) async =>
      (page: PageResult(items: conversationList, page: 1, pages: 1, total: conversationList.length), unread: unreadCount);

  @override
  Future<int> unread() async => unreadCount;

  @override
  Future<MessagePage> messages(String conversationId, {String? before, int limit = 30}) async {
    final e = messagesError;
    if (e != null) throw e;
    final all = thread[conversationId] ?? const <ChatMessage>[];
    final end = before == null ? all.length : all.indexWhere((m) => m.id == before);
    final window = all.sublist(0, end < 0 ? 0 : end);
    final start = window.length > pageSize ? window.length - pageSize : 0;
    final page = window.sublist(start);
    return MessagePage(items: page, hasMore: start > 0, nextBefore: start > 0 ? page.first.id : null);
  }

  @override
  Future<ChatMessage> send(String conversationId, String text) async {
    await sendGate?.future;
    final e = sendError;
    if (e != null) throw e;
    sent.add((conversationId, text.trim()));
    final m = ChatMessage(id: 'm${_n++}', conversationId: conversationId, senderId: 'u1', text: text.trim(), createdAt: DateTime.now());
    thread.putIfAbsent(conversationId, () => []).add(m);
    return m;
  }

  @override
  Future<void> markRead(String conversationId) async {
    marked.add(conversationId);
  }
}

/// A live connection the test controls: push events with [pushMessage] and friends, and see what the app sent in [typingSent].
class FakeRealtime implements RealtimeService {
  final _messages = StreamController<MessageEvent>.broadcast(sync: true);
  final _reads = StreamController<ReadEvent>.broadcast(sync: true);
  final _typing = StreamController<TypingEvent>.broadcast(sync: true);
  final _notifications = StreamController<NotificationPush>.broadcast(sync: true);
  final _connection = StreamController<bool>.broadcast(sync: true);
  final typingSent = <(String, bool)>[];
  bool connected = true;

  void pushMessage(ChatMessage message, Conversation conversation) => _messages.add(MessageEvent(message: message, conversation: conversation));
  void pushRead(String conversationId, String by) => _reads.add(ReadEvent(conversationId: conversationId, byUserId: by));
  void pushTyping(String conversationId, String user, bool typing) => _typing.add(TypingEvent(conversationId: conversationId, userId: user, typing: typing));
  void pushNotification(NotificationItem item, int unread) => _notifications.add(NotificationPush(notification: item, unread: unread));
  void pushConnection(bool up) {
    connected = up;
    _connection.add(up);
  }

  @override
  Stream<MessageEvent> get messages => _messages.stream;
  @override
  Stream<ReadEvent> get reads => _reads.stream;
  @override
  Stream<TypingEvent> get typing => _typing.stream;
  @override
  Stream<NotificationPush> get notifications => _notifications.stream;
  @override
  Stream<bool> get connection => _connection.stream;
  @override
  bool get isConnected => connected;
  @override
  void connect() {}
  @override
  void sendTyping(String conversationId, bool typing) => typingSent.add((conversationId, typing));
  @override
  void dispose() {}
}

/// A phone whose position, or reason for refusing, the test chooses. Counts how often it was asked and opened.
class FakeLocationService implements LocationService {
  FakeLocationService.at(GeoPoint this.point) : problem = null;
  FakeLocationService.failing(LocationProblem this.problem) : point = null;

  final GeoPoint? point;
  final LocationProblem? problem;
  int asked = 0;
  int appSettingsOpened = 0;
  int locationSettingsOpened = 0;

  @override
  Future<LocationResult> current() async {
    asked++;
    return point != null ? LocationResult.found(point!) : LocationResult.failed(problem!);
  }

  @override
  Future<void> openAppSettings() async => appSettingsOpened++;

  @override
  Future<void> openLocationSettings() async => locationSettingsOpened++;
}

class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({this.camera, this.gallery = const []});

  PickedPhoto? camera;
  List<PickedPhoto> gallery;
  int cameraCalls = 0;
  int galleryCalls = 0;

  @override
  Future<PickedPhoto?> takePhoto() async {
    cameraCalls++;
    return camera;
  }

  @override
  Future<List<PickedPhoto>> choosePhotos({required int limit}) async {
    galleryCalls++;
    return gallery.take(limit).toList();
  }
}

Technician sampleTechnician({String id = 't1', String name = 'Ravi Kumar', String availability = 'available'}) =>
    Technician.fromJson({...technicianJson(id: id, name: name), 'availability': {'status': availability}});

ServiceRequest sampleRequest({String id = 'r1', String status = 'request_submitted', List<String> actions = const [], bool onSite = false, bool quote = false}) =>
    ServiceRequest.fromJson(requestJson(id: id, status: status, actions: actions, onSite: onSite, quote: quote));

/// A [TechnicianRepository] that never touches the network.
class FakeTechnicianRepository extends TechnicianRepository {
  FakeTechnicianRepository({this.pages = const {}, this.pageCount = 1, this.error}) : super(ApiClient(store: MemoryKeyValueStore()));

  Map<int, List<Technician>> pages;
  int pageCount;
  ApiException? error;
  final queries = <TechnicianQuery>[];

  @override
  Future<PageResult<Technician>> list(TechnicianQuery query) async {
    queries.add(query);
    final e = error;
    if (e != null) throw e;
    final items = pages[query.page] ?? const <Technician>[];
    return PageResult(items: items, page: query.page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<Technician> get(String id) async => sampleTechnician(id: id);
}

/// A [RequestRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
class FakeRequestRepository extends RequestRepository {
  FakeRequestRepository({ServiceRequest? current, this.pages = const {}, this.pageCount = 1}) : current = current ?? sampleRequest(), super(ApiClient(store: MemoryKeyValueStore()));

  ServiceRequest current;
  Map<int, List<ServiceRequest>> pages;
  int pageCount;

  /// What the next action answers with. Defaults to [current].
  ServiceRequest? result;
  ApiException? actionError;
  final calls = <String>[];
  final listCalls = <({bool activeOnly, int page})>[];

  /// Whose list each `list` call asked for (`customer`, `technician` or `board`).
  final asCalls = <String>[];

  ServiceRequest _done(String call) {
    calls.add(call);
    final e = actionError;
    if (e != null) throw e;
    return result ?? current;
  }

  @override
  Future<ServiceRequest> create({required String listingId, required String issue, String? technicianId, bool onSite = false}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('create:$listingId:${technicianId ?? 'open'}:${onSite ? 'onsite' : 'collect'}:$issue');
    return sampleRequest(id: 'new1');
  }

  @override
  Future<PageResult<ServiceRequest>> list({bool activeOnly = false, int page = 1, int limit = 10, String as = 'customer'}) async {
    listCalls.add((activeOnly: activeOnly, page: page));
    asCalls.add(as);
    final items = pages[page] ?? const <ServiceRequest>[];
    return PageResult(items: items, page: page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<ServiceRequest> get(String id) async => current;

  @override
  Future<ServiceRequest> decideQuotation(String id, String quotationId, {required bool accept, String? reason, bool cancel = false}) async =>
      _done('${accept ? 'approve' : 'decline'}:$quotationId:${reason ?? ''}:${cancel ? 'cancel' : 'again'}');

  @override
  Future<ServiceRequest> cancel(String id, {String? reason}) async => _done('cancel:${reason ?? ''}');

  @override
  Future<ServiceRequest> schedulePickup(String id, {required DateTime date, String? timeSlot, String? notes}) async => _done('pickup');

  @override
  Future<ServiceRequest> confirmHandover(String id, {bool acknowledgeChecklist = false}) async => _done('handover:${acknowledgeChecklist ? 'checklist' : 'plain'}');

  @override
  Future<ServiceRequest> confirmCompletion(String id) async => _done('complete');

  @override
  Future<ServiceRequest> review(String id, ReviewInput input) async => _done('review:${input.toJson()}');

  @override
  Future<ServiceRequest> accept(String id) async => _done('accept');

  @override
  Future<ServiceRequest> decline(String id, String reason) async => _done('decline:$reason');

  @override
  Future<ServiceRequest> startDiagnosis(String id) async => _done('diagnose');

  @override
  Future<ServiceRequest> submitQuotation(String id, QuotationInput input) async =>
      _done('quote:${input.amount}:${input.lines.map((l) => '${l.label}=${l.amount}').join(',')}:${input.etaDays ?? '-'}:${input.validDays}:${input.notes ?? ''}');

  @override
  Future<ServiceRequest> addProgress(String id, {String? note, List<PickedPhoto> photos = const []}) async => _done('progress:${note ?? ''}:${photos.length}');

  @override
  Future<ServiceRequest> completeRepair(String id, {String? note, required List<PickedPhoto> photos}) async => _done('complete-repair:${note ?? ''}:${photos.length}');

  @override
  Future<ServiceRequest> startDelivery(String id, {DateTime? returnDate, String? returnSlot}) async =>
      _done('deliver:${returnDate == null ? 'no-date' : 'date'}:${returnSlot ?? ''}');
}


Map<String, dynamic> verificationDocJson({String id = 'd1', String docType = 'id_proof', String status = 'pending', String? reason}) => {
      '_id': id,
      'docType': docType,
      'status': status,
      'reason': reason,
      'submittedAt': '2026-11-10T09:00:00.000Z',
      'file': {'mime': 'image/jpeg', 'bytes': 120000, 'originalName': 'id.jpg'},
    };

Map<String, dynamic> verificationJson({String status = 'not_submitted', String? reason, List<Map<String, dynamic>> documents = const []}) => {
      'status': status,
      'reason': reason,
      'allowedDocTypes': ['id_proof', 'qualification', 'other'],
      'documents': documents,
    };

/// A [VerificationRepository] that never touches the network and records what was sent.
class FakeVerificationRepository extends VerificationRepository {
  FakeVerificationRepository({VerificationStatus? current}) : current = current ?? VerificationStatus.fromJson(verificationJson()), super(ApiClient(store: MemoryKeyValueStore()));

  VerificationStatus current;
  ApiException? error;
  final calls = <String>[];

  @override
  Future<VerificationStatus> status() async {
    final e = error;
    if (e != null) throw e;
    return current;
  }

  @override
  Future<void> submit(String docType, List<PickedPhoto> photos, {void Function(double progress)? onProgress}) async {
    calls.add('submit:$docType:${photos.length}');
    current = VerificationStatus.fromJson(verificationJson(status: 'pending', documents: [verificationDocJson(docType: docType)]));
  }

  @override
  Future<void> remove(String id) async {
    calls.add('remove:$id');
    current = VerificationStatus.fromJson(verificationJson());
  }
}


RecyclingCenter sampleCenter({String id = 'ce1', String name = 'GreenCycle Recyclers'}) => RecyclingCenter.fromJson(centerJson(id: id, name: name, detail: true));

RecyclingRequest sampleRecycling({
  String id = 'rr1',
  String status = 'requested',
  String role = 'requester',
  List<String> actions = const [],
  bool address = true,
  List<Map<String, dynamic>> materials = const [],
  bool byUser = false,
  bool byCenter = false,
  String? cancelReason,
  Map<String, dynamic>? pickup,
}) =>
    RecyclingRequest.fromJson(
      recyclingJson(id: id, status: status, role: role, actions: actions, address: address, materials: materials, byUser: byUser, byCenter: byCenter, cancelReason: cancelReason, pickup: pickup),
    );

/// A [RecyclingRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
class FakeRecyclingRepository extends RecyclingRepository {
  FakeRecyclingRepository({RecyclingRequest? current, this.centerList = const [], this.pages = const {}, this.pageCount = 1})
      : current = current ?? sampleRecycling(),
        super(ApiClient(store: MemoryKeyValueStore()));

  RecyclingRequest current;
  List<RecyclingCenter> centerList;
  Map<int, List<RecyclingRequest>> pages;
  int pageCount;

  /// What the next action answers with. Defaults to [current].
  RecyclingRequest? result;
  ApiException? actionError;
  final calls = <String>[];
  final centerQueries = <CenterQuery>[];
  final listCalls = <({String? status, int page})>[];

  RecyclingRequest _done(String call) {
    final e = actionError;
    if (e != null) throw e;
    calls.add(call);
    return result ?? current;
  }

  @override
  Future<PageResult<RecyclingCenter>> centers(CenterQuery query) async {
    centerQueries.add(query);
    final e = actionError;
    if (e != null) throw e;
    return PageResult(items: query.page == 1 ? centerList : const [], page: query.page, pages: 1, total: centerList.length);
  }

  @override
  Future<RecyclingCenter> center(String id) async {
    for (final c in centerList) {
      if (c.id == id) return c;
    }
    return sampleCenter(id: id);
  }

  @override
  Future<RecyclingRequest> create({
    required String centerId,
    required List<String> categoryIds,
    required int deviceCount,
    required String area,
    required String address,
    DateTime? preferredDate,
    String? notes,
    String? listingId,
    List<PickedPhoto> photos = const [],
  }) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('create:$centerId:${categoryIds.join('|')}:$deviceCount:$area:$address:${notes ?? ''}:${photos.length}:${listingId ?? '-'}');
    return sampleRecycling(id: 'rr-new');
  }

  @override
  Future<PageResult<RecyclingRequest>> list({String? as, String? status, int page = 1}) async {
    listCalls.add((status: status, page: page));
    final items = pages[page] ?? const <RecyclingRequest>[];
    return PageResult(items: items, page: page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<RecyclingRequest> get(String id) async => current;

  @override
  Future<RecyclingRequest> accept(String id) async => _done('accept');

  @override
  Future<RecyclingRequest> reject(String id, String reason) async => _done('reject:$reason');

  @override
  Future<RecyclingRequest> markReceived(String id) async => _done('received');

  @override
  Future<RecyclingRequest> markProcessed(String id) async => _done('processed');

  @override
  Future<RecyclingRequest> complete(String id) async => _done('complete');

  @override
  Future<RecyclingRequest> schedulePickup(String id, {required DateTime date, String? timeSlot, String? notes}) async => _done('pickup');

  @override
  Future<RecyclingRequest> confirmHandover(String id, {bool acknowledgeChecklist = false}) async => _done('handover:${acknowledgeChecklist ? 'checklist' : 'plain'}');

  @override
  Future<RecyclingRequest> saveMaterials(String id, List<RecoveredMaterial> materials, {String? reportNotes}) async =>
      _done('materials:${materials.map((m) => '${m.type}=${m.actualKg ?? '-'}/${m.estimatedKg ?? '-'}').join(',')}:${reportNotes ?? ''}');

  @override
  Future<RecyclingRequest> cancel(String id, {String? reason}) async => _done('cancel:${reason ?? ''}');

  RecyclingReport? reportData;
  final reportCalls = <({DateTime? from, DateTime? to})>[];

  @override
  Future<RecyclingReport> report({DateTime? from, DateTime? to, String? category}) async {
    reportCalls.add((from: from, to: to));
    return reportData ?? const RecyclingReport(center: 'GreenCycle Recyclers');
  }

}


Product sampleProduct({String id = 'p1', String title = 'Refurbished ThinkPad', int stock = 3, String status = 'active', bool isMine = false}) =>
    Product.fromJson(productJson(id: id, title: title, detail: true, stock: stock, status: status, isMine: isMine));

Order sampleOrder({
  String id = 'o1',
  String status = 'placed',
  String role = 'buyer',
  List<String> actions = const [],
  bool canReview = false,
  bool reviewed = false,
  String? cancelReason,
  String paymentStatus = 'pending',
}) =>
    Order.fromJson(orderJson(id: id, status: status, role: role, actions: actions, canReview: canReview, reviewed: reviewed, cancelReason: cancelReason, paymentStatus: paymentStatus));

/// A [MarketplaceRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
class FakeMarketplaceRepository extends MarketplaceRepository {
  FakeMarketplaceRepository({Order? current, Product? product, this.productPages = const {}, this.pages = const {}, this.pageCount = 1})
      : current = current ?? sampleOrder(),
        shown = product ?? sampleProduct(),
        super(ApiClient(store: MemoryKeyValueStore()));

  Order current;
  Product shown;
  Map<int, List<Product>> productPages;
  Map<int, List<Order>> pages;
  int pageCount;

  /// What the next action answers with. Defaults to [current].
  Order? result;
  ApiException? actionError;
  final calls = <String>[];
  final productQueries = <ProductQuery>[];
  final listCalls = <({String? status, int page})>[];

  Order _done(String call) {
    final e = actionError;
    if (e != null) throw e;
    calls.add(call);
    return result ?? current;
  }

  @override
  Future<PageResult<Product>> products(ProductQuery query) async {
    productQueries.add(query);
    final items = productPages[query.page] ?? const <Product>[];
    return PageResult(items: items, page: query.page, pages: 1, total: items.length);
  }

  @override
  Future<Product> product(String id) async => shown;

  @override
  Future<void> enquire(String productId, String message) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('enquire:$productId:$message');
  }

  @override
  Future<Order> placeOrder({required String productId, int quantity = 1, String paymentMethod = 'cod', String? deliveryArea, String? notes}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('place:$productId:$quantity:$paymentMethod:${deliveryArea ?? ''}:${notes ?? ''}');
    return sampleOrder(id: 'o-new');
  }

  /// The seller's own products, by page.
  Map<int, List<Product>> minePages = const {};
  final mineCalls = <String?>[];
  final inputs = <ProductInput>[];

  @override
  Future<PageResult<Product>> mine({String? status, int page = 1}) async {
    mineCalls.add(status);
    final items = minePages[page] ?? const <Product>[];
    return PageResult(items: items, page: page, pages: 1, total: items.length);
  }

  @override
  Future<Product> createProduct(ProductInput input) async {
    final e = actionError;
    if (e != null) throw e;
    inputs.add(input);
    calls.add('create:${input.title}');
    return sampleProduct(id: 'p-new', title: input.title ?? 'New product', isMine: true);
  }

  @override
  Future<Product> updateProduct(String id, ProductInput input) async {
    final e = actionError;
    if (e != null) throw e;
    inputs.add(input);
    calls.add('update:$id');
    return sampleProduct(id: id, title: input.title ?? 'Product', isMine: true);
  }

  @override
  Future<void> removeProduct(String id) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('remove:$id');
  }

  @override
  Future<PageResult<Order>> orders({String? as, String? status, int page = 1}) async {
    listCalls.add((status: status, page: page));
    final items = pages[page] ?? const <Order>[];
    return PageResult(items: items, page: page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<Order> order(String id) async => current;

  @override
  Future<Order> confirm(String id) async => _done('confirm');

  @override
  Future<Order> markReady(String id) async => _done('ready');

  @override
  Future<Order> markDelivered(String id) async => _done('delivered');

  @override
  Future<Order> complete(String id) async => _done('complete');

  @override
  Future<Order> cancel(String id, {String? reason}) async => _done('cancel:${reason ?? ''}');

  @override
  Future<Order> review(String id, ReviewInput input) async => _done('review:${input.toJson()}');
}


Donation sampleDonation({
  String id = 'd1',
  String status = 'open',
  String role = 'visitor',
  List<String> actions = const [],
  int? pendingRequests,
  Map<String, dynamic>? myRequest,
  List<Map<String, dynamic>> requests = const [],
  bool withRecipient = false,
  Map<String, dynamic>? pickup,
  bool donorConfirmed = false,
  bool recipientConfirmed = false,
  String? cancelReason,
  String? refNo,
}) =>
    Donation.fromJson(donationJson(
      id: id,
      status: status,
      role: role,
      actions: actions,
      pendingRequests: pendingRequests,
      myRequest: myRequest,
      requests: requests,
      withRecipient: withRecipient,
      pickup: pickup,
      donorConfirmed: donorConfirmed,
      recipientConfirmed: recipientConfirmed,
      cancelReason: cancelReason,
      refNo: refNo,
    ));

/// A [DonationRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
class FakeDonationRepository extends DonationRepository {
  FakeDonationRepository({Donation? current, this.pages = const {}, this.pageCount = 1, this.recipient = const RecipientStatus()})
      : current = current ?? sampleDonation(),
        super(ApiClient(store: MemoryKeyValueStore()));

  Donation current;
  Map<int, List<Donation>> pages;
  int pageCount;
  RecipientStatus recipient;

  /// What the next action answers with. Defaults to [current].
  Donation? result;
  ApiException? actionError;
  final calls = <String>[];
  final queries = <DonationQuery>[];

  Donation _done(String call) {
    final e = actionError;
    if (e != null) throw e;
    calls.add(call);
    return result ?? current;
  }

  @override
  Future<PageResult<Donation>> donations(DonationQuery query) async {
    queries.add(query);
    final items = pages[query.page] ?? const <Donation>[];
    return PageResult(items: items, page: query.page, pages: pageCount, total: pages.values.fold(0, (n, l) => n + l.length));
  }

  @override
  Future<Donation> donation(String id) async => current;

  @override
  Future<Donation> offer({required String listingId, String? description}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('offer:$listingId:${description?.trim() ?? ''}');
    return sampleDonation(id: 'd-new');
  }

  @override
  Future<Donation> request(String id, {required String justification, String? intendedUse}) async => _done('request:$justification:${intendedUse?.trim() ?? ''}');

  @override
  Future<Donation> withdraw(String id) async => _done('withdraw');

  @override
  Future<Donation> decide(String id, String requestId, {required bool accept}) async => _done('decide:$requestId:$accept');

  @override
  Future<Donation> scheduleHandover(String id, {required DateTime date, String? timeSlot, String? notes}) async => _done('handover-time');

  @override
  Future<Donation> confirmHandover(String id, {bool acknowledgeChecklist = false}) async => _done(acknowledgeChecklist ? 'confirm:checklist' : 'confirm:plain');

  @override
  Future<Donation> cancel(String id, {String? reason}) async => _done('cancel:${reason ?? ''}');

  @override
  Future<DonationConfirmation> confirmation(String id) async => const DonationConfirmation(
        refNo: 'DON-2026-0001',
        deviceTitle: 'Old Dell laptop',
        donorName: 'Ravi Kumar',
        recipientName: 'Meena',
        recipientOrg: 'Sunrise School',
        statement: 'No payment was made or processed.',
      );

  @override
  Future<RecipientStatus> recipientStatus() async => recipient;

  @override
  Future<RecipientStatus> applyAsRecipient({required String orgType, required String orgName, required String registrationNo}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('apply:$orgType:${orgName.trim()}:${registrationNo.trim()}');
    recipient = RecipientStatus(isOrg: true, orgType: orgType, orgName: orgName, registrationNo: registrationNo, status: 'pending');
    return recipient;
  }
}


Opportunity sampleOpportunity({String id = 'o1', String? applyBlock, Map<String, dynamic>? myApplication, String? viewerRole = 'student', int seatsLeft = 2}) =>
    Opportunity.fromJson(opportunityJson(id: id, applyBlock: applyBlock, myApplication: myApplication, viewerRole: viewerRole, seatsLeft: seatsLeft));

Application sampleApplication({String id = 'a1', String status = 'applied', List<String> actions = const ['withdraw'], double hours = 0, String? feedback, String? certificate}) =>
    Application.fromJson(applicationJson(id: id, status: status, actions: actions, hours: hours, feedback: feedback, certificate: certificate));

/// A task as its supervisor sees it: no apply block, with the applicant counts.
Opportunity sampleTask({String id = 'o1', String status = 'open', Map<String, int> counts = const {'applied': 2, 'accepted': 1}}) =>
    Opportunity.fromJson({...opportunityJson(id: id, viewerRole: 'supervisor', status: status), 'counts': counts});

/// An application as the supervisor sees it, with the student's public details.
Application sampleApplicant({String id = 'a1', String status = 'applied', List<String> actions = const ['accept', 'reject']}) => Application.fromJson({
      ...applicationJson(id: id, status: status, actions: actions),
      'viewerRole': 'supervisor',
      'student': {'_id': 's1', 'name': 'Priya', 'college': 'NIT Trichy', 'course': 'ECE', 'yearOfStudy': 3, 'hoursCompleted': 6, 'skills': ['testing']},
    });

/// A [LearningRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
/// Records what would have been handed to the share sheet.
class FakeCertificateSaver extends CertificateSaver {
  FakeCertificateSaver();

  final shared = <(String, int)>[];
  Object? failWith;
  Completer<void>? hold;

  @override
  Future<void> share(String filename, Uint8List bytes) async {
    await hold?.future;
    final f = failWith;
    if (f != null) throw f;
    shared.add((filename, bytes.length));
  }
}

class FakeLearningRepository extends LearningRepository {
  FakeLearningRepository({
    Opportunity? opportunity,
    Application? current,
    this.opportunityPages = const {},
    this.pages = const {},
    this.pageCount = 1,
    Experience? experience,
    this.certificateList = const [],
  })  : shown = opportunity ?? sampleOpportunity(),
        current = current ?? sampleApplication(),
        experienceData = experience ?? const Experience(summary: StudentSummary()),
        super(ApiClient(store: MemoryKeyValueStore()));

  Opportunity shown;
  Application current;
  Map<int, List<Opportunity>> opportunityPages;
  Map<int, List<Application>> pages;
  int pageCount;
  Experience experienceData;
  List<Certificate> certificateList;

  /// What the next action answers with. Defaults to [current].
  Application? result;
  ApiException? actionError;
  final calls = <String>[];
  final opportunityQueries = <OpportunityQuery>[];
  final listCalls = <({String? status, int page})>[];

  @override
  Future<PageResult<Opportunity>> opportunities(OpportunityQuery query) async {
    opportunityQueries.add(query);
    final items = opportunityPages[query.page] ?? const <Opportunity>[];
    return PageResult(items: items, page: query.page, pages: pageCount, total: items.length);
  }

  @override
  Future<Opportunity> opportunity(String id) async => shown;

  @override
  Future<Application> apply(String opportunityId, {String? message}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('apply:$opportunityId:${message?.trim() ?? ''}');
    return sampleApplication(id: 'a-new');
  }

  @override
  Future<PageResult<Application>> applications({String? status, int page = 1}) async {
    listCalls.add((status: status, page: page));
    final items = pages[page] ?? const <Application>[];
    return PageResult(items: items, page: page, pages: pageCount, total: items.length);
  }

  @override
  Future<Application> application(String id) async => current;

  @override
  Future<Application> withdraw(String id, {String? reason}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('withdraw:${reason ?? ''}');
    return result ?? current;
  }

  @override
  Future<Experience> experience() async => experienceData;

  @override
  Future<List<Certificate>> certificates() async => certificateList;

  ApiException? pdfError;
  final pdfAsked = <String>[];

  @override
  Future<({Uint8List bytes, String filename})> certificatePdf(String id) async {
    pdfAsked.add(id);
    final e = pdfError;
    if (e != null) throw e;
    return (bytes: Uint8List.fromList([37, 80, 68, 70]), filename: 'certificate-$id.pdf');
  }

  /// The supervisor's own tasks, by page, and the applicants on a task.
  Map<int, List<Opportunity>> minePages = const {};
  List<Application> applicantList = const [];
  final mineCalls = <String?>[];
  final applicantCalls = <String?>[];
  final inputs = <OpportunityInput>[];

  @override
  Future<PageResult<Opportunity>> myOpportunities({String? status, int page = 1}) async {
    mineCalls.add(status);
    final items = minePages[page] ?? const <Opportunity>[];
    return PageResult(items: items, page: page, pages: 1, total: items.length);
  }

  @override
  Future<Opportunity> createOpportunity(OpportunityInput input) async {
    final e = actionError;
    if (e != null) throw e;
    inputs.add(input);
    calls.add('post:${input.title}');
    return sampleTask(id: 'o-new');
  }

  @override
  Future<Opportunity> updateOpportunity(String id, OpportunityInput input) async {
    final e = actionError;
    if (e != null) throw e;
    inputs.add(input);
    calls.add('edit:$id');
    return sampleTask(id: id);
  }

  @override
  Future<Opportunity> setOpportunityOpen(String id, {required bool open}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add(open ? 'open:$id' : 'close:$id');
    return sampleTask(id: id, status: open ? 'open' : 'closed');
  }

  @override
  Future<PageResult<Application>> applicants(String opportunityId, {String? status, int page = 1}) async {
    applicantCalls.add(status);
    return PageResult(items: applicantList, page: page, pages: 1, total: applicantList.length);
  }

  Application _done(String call) {
    final e = actionError;
    if (e != null) throw e;
    calls.add(call);
    return result ?? current;
  }

  @override
  Future<Application> decide(String id, {required bool accept, String? feedback}) async => _done('${accept ? 'accept' : 'reject'}:${feedback ?? ''}');

  @override
  Future<Application> start(String id) async => _done('start');

  @override
  Future<Application> complete(String id, {required double hours, String? feedback}) async => _done('complete:$hours:${feedback ?? ''}');

}


RefurbOpportunity sampleRefurbOpportunity({String id = 'l1', bool hasOffered = false}) => RefurbOpportunity.fromJson(refurbOpportunityJson(id: id, hasOffered: hasOffered));

RefurbJob sampleRefurbJob({
  String id = 'j1',
  String status = 'offered',
  String role = 'refurbisher',
  List<String> actions = const ['withdraw'],
  Map<String, dynamic>? pickup,
  bool ownerConfirmed = false,
  bool refurbisherConfirmed = false,
  List<String> photoStages = const [],
  String? nextStatus,
  double amount = 500,
}) =>
    RefurbJob.fromJson(refurbJobJson(
      id: id,
      status: status,
      role: role,
      actions: actions,
      pickup: pickup,
      ownerConfirmed: ownerConfirmed,
      refurbisherConfirmed: refurbisherConfirmed,
      photoStages: photoStages,
      nextStatus: nextStatus,
      amount: amount,
    ));

/// A [RefurbishmentRepository] that never touches the network. Every action records itself in [calls] and answers with [result].
class FakeRefurbishmentRepository extends RefurbishmentRepository {
  FakeRefurbishmentRepository({RefurbJob? current, this.opportunityPages = const {}, this.pages = const {}, this.pageCount = 1})
      : current = current ?? sampleRefurbJob(),
        super(ApiClient(store: MemoryKeyValueStore()));

  RefurbJob current;
  Map<int, List<RefurbOpportunity>> opportunityPages;
  Map<int, List<RefurbJob>> pages;
  int pageCount;

  /// What the next action answers with. Defaults to [current].
  RefurbJob? result;
  ApiException? actionError;
  final calls = <String>[];
  final opportunityQueries = <RefurbOpportunityQuery>[];
  final listCalls = <({String? as, String? status, int page})>[];

  RefurbJob _done(String call) {
    final e = actionError;
    if (e != null) throw e;
    calls.add(call);
    return result ?? current;
  }

  @override
  Future<PageResult<RefurbOpportunity>> opportunities(RefurbOpportunityQuery query) async {
    opportunityQueries.add(query);
    final items = opportunityPages[query.page] ?? const <RefurbOpportunity>[];
    return PageResult(items: items, page: query.page, pages: pageCount, total: items.length);
  }

  @override
  Future<RefurbJob> makeOffer({required String listingId, double? amount, String? message}) async {
    final e = actionError;
    if (e != null) throw e;
    calls.add('offer:$listingId:${amount ?? ''}:${message?.trim() ?? ''}');
    return sampleRefurbJob(id: 'j-new');
  }

  @override
  Future<PageResult<RefurbJob>> jobs({String? as, String? status, int page = 1}) async {
    listCalls.add((as: as, status: status, page: page));
    final items = pages[page] ?? const <RefurbJob>[];
    return PageResult(items: items, page: page, pages: pageCount, total: items.length);
  }

  @override
  Future<RefurbJob> job(String id) async => current;

  @override
  Future<RefurbJob> decide(String id, {required bool accept}) async => _done(accept ? 'accept' : 'reject');

  @override
  Future<RefurbJob> withdraw(String id) async => _done('withdraw');

  @override
  Future<RefurbJob> scheduleHandover(String id, {required DateTime date, String? timeSlot, String? notes}) async => _done('schedule');

  @override
  Future<RefurbJob> confirmHandover(String id, {bool acknowledgeChecklist = false}) async => _done('confirm:$acknowledgeChecklist');

  @override
  Future<RefurbJob> advance(String id, {required String status, String? note}) async => _done('advance:$status:${note ?? ''}');

  @override
  Future<RefurbJob> addPhotos(String id, {required String stage, required List<PickedPhoto> photos, String? note}) async => _done('photos:$stage:${photos.length}:${note ?? ''}');

  @override
  Future<RefurbJob> cancel(String id, {String? reason}) async => _done('cancel:${reason ?? ''}');
}
