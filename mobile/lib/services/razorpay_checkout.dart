import 'dart:async';

import 'package:razorpay_flutter/razorpay_flutter.dart';

/// What `POST /orders/:id/payment` returns: everything the payment window needs. The amount is in paise.
class PaymentSession {
  const PaymentSession({
    required this.keyId,
    required this.gatewayOrderId,
    required this.amount,
    required this.currency,
    required this.description,
  });

  final String keyId;
  final String gatewayOrderId;
  final int amount;
  final String currency;
  final String description;

  factory PaymentSession.fromJson(Map<String, dynamic> json) => PaymentSession(
        keyId: json['keyId'] as String,
        gatewayOrderId: json['gatewayOrderId'] as String,
        amount: (json['amount'] as num).toInt(),
        currency: (json['currency'] as String?) ?? 'INR',
        description: (json['description'] as String?) ?? 'Refurbished device',
      );
}

/// The three values the server checks before it marks an order paid.
class PaymentProof {
  const PaymentProof({required this.orderId, required this.paymentId, required this.signature});

  final String orderId;
  final String paymentId;
  final String signature;

  Map<String, String> toJson() => {
        'razorpay_order_id': orderId,
        'razorpay_payment_id': paymentId,
        'razorpay_signature': signature,
      };
}

/// Closing the payment window is not an error: nothing was charged and the order stays as it was.
class PaymentCancelled implements Exception {
  const PaymentCancelled();
}

class PaymentFailed implements Exception {
  const PaymentFailed(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Opens Razorpay's checkout (TEST mode demo: no real money). Completes with the proof to send to the server.
abstract class PaymentLauncher {
  Future<PaymentProof> pay(PaymentSession session, {String? name, String? email});
}

class RazorpayLauncher implements PaymentLauncher {
  @override
  Future<PaymentProof> pay(PaymentSession session, {String? name, String? email}) {
    final done = Completer<PaymentProof>();
    final rz = Razorpay();

    void finish(void Function() settle) {
      if (done.isCompleted) return;
      rz.clear();
      settle();
    }

    rz.on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse r) {
      finish(() {
        final orderId = r.orderId;
        final paymentId = r.paymentId;
        final signature = r.signature;
        if (orderId == null || paymentId == null || signature == null) {
          done.completeError(const PaymentFailed('The payment could not be confirmed. Try again.'));
        } else {
          done.complete(PaymentProof(orderId: orderId, paymentId: paymentId, signature: signature));
        }
      });
    });
    rz.on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse r) {
      finish(() {
        // 2 = the person closed the window.
        if (r.code == Razorpay.PAYMENT_CANCELLED) {
          done.completeError(const PaymentCancelled());
        } else {
          done.completeError(PaymentFailed((r.message ?? '').trim().isEmpty ? 'The payment failed. You can try again.' : r.message!));
        }
      });
    });
    rz.on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse r) {
      finish(() => done.completeError(const PaymentCancelled()));
    });

    rz.open({
      'key': session.keyId,
      'order_id': session.gatewayOrderId,
      'amount': session.amount,
      'currency': session.currency,
      'name': 'E-Waste Network (demo)',
      'description': session.description,
      'prefill': {
        if (name != null) 'name': name,
        if (email != null) 'email': email,
      },
      'theme': {'color': '#1E8449'},
    });
    return done.future;
  }
}
