import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/models/page_result.dart';
import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/models/technician.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/services/technician_repository.dart';
import 'models/listing_test.dart';
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
