import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/order_validation.dart';
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

/// The order form: how many, how they will pay the seller, and the delivery area, city and pincode (never an exact address, BR-08). `null` if the buyer backs out.
Future<OrderChoice?> askOrder(BuildContext context,
    {required String title, required double price, required int stock}) {
  return showModalBottomSheet<OrderChoice>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _OrderSheet(title: title, price: price, stock: stock),
  );
}

class _OrderSheet extends StatefulWidget {
  const _OrderSheet(
      {required this.title, required this.price, required this.stock});

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

  int get _max =>
      widget.stock < maxOrderQuantity ? widget.stock : maxOrderQuantity;

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
      padding: EdgeInsets.fromLTRB(
          20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Order ${widget.title}', style: theme.textTheme.titleLarge),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                      child:
                          Text('How many?', style: theme.textTheme.titleSmall)),
                  IconButton(
                    tooltip: 'One fewer',
                    constraints:
                        const BoxConstraints(minWidth: 48, minHeight: 48),
                    icon: const Icon(Icons.remove_circle_outline),
                    onPressed: _quantity <= 1
                        ? null
                        : () => setState(() => _quantity--),
                  ),
                  Semantics(
                      liveRegion: true,
                      label: '$_quantity',
                      child: ExcludeSemantics(
                          child: Text('$_quantity',
                              style: theme.textTheme.titleLarge))),
                  IconButton(
                    tooltip: 'One more',
                    constraints:
                        const BoxConstraints(minWidth: 48, minHeight: 48),
                    icon: const Icon(Icons.add_circle_outline),
                    onPressed: _quantity >= _max
                        ? null
                        : () => setState(() => _quantity++),
                  ),
                ],
              ),
              Text('Total: ${formatPrice(widget.price * _quantity)}',
                  style: theme.textTheme.titleMedium),
              const SizedBox(height: 12),
              Text('How will you pay the seller?',
                  style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final (value, label) in paymentMethods)
                    AppChip(
                        label: label,
                        selected: _payment == value,
                        onTap: () => setState(() => _payment = value))
                ],
              ),
              const SizedBox(height: 4),
              Text('You pay the seller directly. The app never handles money.',
                  style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              Text('Where should it be delivered?',
                  style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              TextFormField(
                  controller: _area,
                  validator: validateDeliveryArea,
                  decoration: const InputDecoration(
                      labelText: 'Area or locality',
                      prefixIcon: Icon(Icons.place_outlined))),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _city,
                  validator: validateDeliveryCity,
                  decoration: const InputDecoration(
                      labelText: 'City',
                      prefixIcon: Icon(Icons.location_city_outlined))),
              const SizedBox(height: 12),
              TextFormField(
                controller: _pincode,
                validator: validateDeliveryPincode,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                    labelText: 'Pincode',
                    prefixIcon: Icon(Icons.pin_drop_outlined),
                    counterText: ''),
              ),
              const SizedBox(height: 12),
              TextFormField(
                  controller: _notes,
                  validator: validateOrderNotes,
                  maxLines: 2,
                  decoration: const InputDecoration(
                      labelText: 'Note for the seller (optional)')),
              const SizedBox(height: 16),
              FilledButton(
                  onPressed: _submit,
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
                  child: const Text('Place order')),
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
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Ask the seller', style: theme.textTheme.titleLarge),
              Text(widget.title, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _message,
                validator: validateEnquiry,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Your question'),
              ),
              const SizedBox(height: 8),
              FilledButton(
                  onPressed: _send,
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48)),
                  child: const Text('Send question')),
            ],
          ),
        ),
      ),
    );
  }
}
