import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/order_validation.dart';
import '../../widgets/detect_location_button.dart';
import '../../widgets/app_chip.dart';

/// What the buyer chose in the order sheet.
class OrderChoice {
  const OrderChoice(
      {required this.quantity,
      required this.paymentMethod,
      required this.deliveryArea,
      required this.deliveryCity,
      required this.deliveryPincode,
      this.notes = ''});

  final int quantity;
  final String paymentMethod;
  final String deliveryArea;
  final String deliveryCity;
  final String deliveryPincode;
  final String notes;
}

/// The icon tile, title and one line of help at the top of a sheet.
class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
            child: Icon(icon, color: theme.colorScheme.primary),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(title, style: theme.textTheme.titleLarge)),
              const SizedBox(height: 2),
              Text(subtitle, style: theme.textTheme.bodySmall),
            ],
          ),
        ),
      ],
    );
  }
}

/// A small heading with an icon above a group of fields.
class _SheetSection extends StatelessWidget {
  const _SheetSection(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: theme.colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleSmall))),
        ],
      ),
    );
  }
}

/// The order form: how many, how they will pay the seller, and the delivery area, city and pincode (never an exact address, BR-08). `null` if the buyer backs out.
Future<OrderChoice?> askOrder(BuildContext context, {required String title, required double price, required int stock}) {
  return showModalBottomSheet<OrderChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _OrderSheet(title: title, price: price, stock: stock),
  );
}

class _OrderSheet extends StatefulWidget {
  const _OrderSheet({required this.title, required this.price, required this.stock});

  final String title;
  final double price;
  final int stock;

  @override
  State<_OrderSheet> createState() => _OrderSheetState();
}

class _OrderSheetState extends State<_OrderSheet> {
  final _formKey = GlobalKey<FormState>();
  final _area = TextEditingController();
  final _city = TextEditingController();
  final _pincode = TextEditingController();
  final _notes = TextEditingController();
  int _quantity = 1;
  String _payment = 'cod';

  int get _max => widget.stock < maxOrderQuantity ? widget.stock : maxOrderQuantity;

  @override
  void dispose() {
    _area.dispose();
    _city.dispose();
    _pincode.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(
        context,
        OrderChoice(
            quantity: _quantity,
            paymentMethod: _payment,
            deliveryArea: _area.text.trim(),
            deliveryCity: _city.text.trim(),
            deliveryPincode: _pincode.text.trim(),
            notes: _notes.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SheetHeader(icon: Icons.shopping_bag_outlined, title: 'Order ${widget.title}', subtitle: 'You pay the seller directly. The app never handles money.'),
              const _SheetSection(Icons.format_list_numbered_rounded, 'How many?'),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(18)),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('Quantity', style: theme.textTheme.bodyMedium)),
                        IconButton.outlined(
                          tooltip: 'One fewer',
                          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                          icon: const Icon(Icons.remove_circle_outline),
                          onPressed: _quantity <= 1 ? null : () => setState(() => _quantity--),
                        ),
                        SizedBox(
                          width: 44,
                          child: Semantics(liveRegion: true, label: '$_quantity', child: ExcludeSemantics(child: Text('$_quantity', style: theme.textTheme.titleLarge, textAlign: TextAlign.center))),
                        ),
                        IconButton.outlined(
                          tooltip: 'One more',
                          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                          icon: const Icon(Icons.add_circle_outline),
                          onPressed: _quantity >= _max ? null : () => setState(() => _quantity++),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Divider(height: 1, color: theme.colorScheme.outlineVariant),
                    const SizedBox(height: 10),
                    Align(alignment: Alignment.centerRight, child: Text('Total: ${formatPrice(widget.price * _quantity)}', style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800))),
                  ],
                ),
              ),
              const _SheetSection(Icons.payments_outlined, 'How will you pay the seller?'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final (value, label) in paymentMethods) AppChip(label: label, selected: _payment == value, onTap: () => setState(() => _payment = value))],
              ),
              const _SheetSection(Icons.local_shipping_outlined, 'Where should it be delivered?'),
              DetectLocationButton(onDetected: (_, place) {
                if (place == null) return;
                setState(() {
                  if (place.area.isNotEmpty) _area.text = place.area;
                  if (place.city.isNotEmpty) _city.text = place.city;
                  if (RegExp(r'^[1-9][0-9]{5}$').hasMatch(place.postcode)) _pincode.text = place.postcode;
                });
              }),
              const SizedBox(height: 12),
              TextFormField(controller: _area, validator: validateDeliveryArea, decoration: const InputDecoration(labelText: 'Area or locality', prefixIcon: Icon(Icons.place_outlined))),
              const SizedBox(height: 12),
              TextFormField(controller: _city, validator: validateDeliveryCity, decoration: const InputDecoration(labelText: 'City', prefixIcon: Icon(Icons.location_city_outlined))),
              const SizedBox(height: 12),
              TextFormField(
                controller: _pincode,
                validator: validateDeliveryPincode,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(labelText: 'Pincode', prefixIcon: Icon(Icons.pin_drop_outlined), counterText: ''),
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _notes, validator: validateOrderNotes, maxLines: 2, decoration: const InputDecoration(labelText: 'Note for the seller (optional)', prefixIcon: Icon(Icons.edit_note_rounded))),
              const SizedBox(height: 20),
              FilledButton(onPressed: _submit, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), child: const Text('Place order')),
            ],
          ),
        ),
      ),
    );
  }
}

/// A short question for the seller. Returns the text, or `null` if the buyer backs out.
Future<String?> askEnquiry(BuildContext context, {required String title}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _EnquirySheet(title: title),
  );
}

class _EnquirySheet extends StatefulWidget {
  const _EnquirySheet({required this.title});

  final String title;

  @override
  State<_EnquirySheet> createState() => _EnquirySheetState();
}

class _EnquirySheetState extends State<_EnquirySheet> {
  final _formKey = GlobalKey<FormState>();
  final _message = TextEditingController();

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  void _send() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, _message.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SheetHeader(icon: Icons.chat_bubble_outline, title: 'Ask the seller', subtitle: widget.title),
              const SizedBox(height: 18),
              TextFormField(
                controller: _message,
                validator: validateEnquiry,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Your question'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), child: const Text('Send question')),
            ],
          ),
        ),
      ),
    );
  }
}
