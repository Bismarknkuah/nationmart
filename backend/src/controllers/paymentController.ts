import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as pay from '../repos/paymentRepo';
import * as ord from '../repos/orderRepo';
import { notify } from '../repos/notificationRepo';
import { q } from '../db/pg';
import * as po from '../repos/payoutRepo';
import {
  initiateCardPayment as paystackCheckout, verifyTransaction, verifyWebhookSignature,
  chargeAuthorization, extractAuthorization, initiateMomoCharge,
  PayChannel, MomoNetwork,
} from '../services/paystackService';

/**
 * POST /api/payments/initiate
 *
 * Starts a payment for an order, a subscription, or a wallet top-up. Works the
 * same for a buyer paying for goods and a seller paying their subscription —
 * both are just people who owe money.
 *
 * body.channel selects how they want to pay:
 *   'card'          — Visa / Mastercard, hosted Paystack page
 *   'mobile_money'  — MTN / Telecel / AirtelTigo
 *   'bank_transfer' — bank transfer, where the Paystack account supports it
 *   (omitted)       — let them choose on the Paystack page
 *
 * body.methodId charges a SAVED card instead: no redirect, one tap, done.
 */
export const initiatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, purpose, amount, channel, methodId, momoPhone, momoNetwork } = req.body;
    const kind: 'order' | 'subscription' | 'wallet_topup' =
      ['order', 'subscription', 'wallet_topup'].includes(purpose) ? purpose : 'order';

    let value = Number(amount) || 0;
    if (kind === 'order') {
      const order = await ord.findById(orderId);
      if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
      if (order.buyer_id !== req.user.id) { res.status(403).json({ error: 'Not your order.' }); return; }
      if (order.payment_status === 'paid') { res.status(409).json({ error: 'This order is already paid.' }); return; }
      value = Number(order.total_amount);
    }
    if (value <= 0) { res.status(400).json({ error: 'A positive amount is required.' }); return; }

    const allowed: PayChannel[] = ['card', 'mobile_money', 'bank_transfer'];
    const chosen: PayChannel | undefined =
      allowed.includes(channel) ? channel : undefined;

    const payment = await pay.createPayment({
      userId: req.user.id,
      orderId: kind === 'order' ? orderId : null,
      purpose: kind,
      amount: value,
      channel: chosen ?? 'card',
    });

    // ── One tap: charge a card they have already approved once. ──
    if (methodId) {
      const method = await po.findMethod(methodId, req.user.id);
      if (!method || method.kind !== 'card' || !method.auth_code) {
        res.status(422).json({ error: 'That saved card is not usable.' });
        return;
      }

      const charged = await chargeAuthorization({
        authCode: method.auth_code,
        email: req.user.email,
        amount: value,
        reference: payment.reference,
        metadata: { purpose: kind, orderId: orderId ?? null, userId: req.user.id },
      });

      if (charged.status === 'success') {
        const result = await pay.settlePayment(payment.reference);
        if (result && !result.alreadySettled) await sendReceipt(payment.reference);
        res.json({
          reference: payment.reference,
          status: 'paid',
          amount: value,
          message: `Paid with ${method.label}.`,
        });
        return;
      }

      res.status(402).json({
        reference: payment.reference,
        status: charged.status,
        error: charged.message || 'The card was declined.',
      });
      return;
    }

    // ── Direct mobile-money prompt. ──
    // The buyer taps Pay and their phone buzzes. No redirect, no web page — the
    // approval happens on the handset. This is what most Ghanaian buyers expect,
    // and it is why we call Paystack's Charge API rather than sending them to a
    // hosted checkout.
    if (chosen === 'mobile_money') {
      const phone = String(momoPhone || req.user.phone || '').replace(/[^\d+]/g, '');
      const network = String(momoNetwork || '').toLowerCase() as MomoNetwork;

      if (!phone || phone.length < 9) {
        res.status(400).json({ error: 'A mobile money number is required.' });
        return;
      }
      if (!['mtn', 'telecel', 'airteltigo'].includes(network)) {
        res.status(400).json({ error: 'Choose MTN, Telecel or AirtelTigo.' });
        return;
      }

      const prompt = await initiateMomoCharge({
        email: req.user.email,
        amountGHS: value,
        phone,
        network,
        reference: payment.reference,
      });

      if (prompt.status === 'failed') {
        res.status(502).json({
          reference: payment.reference,
          status: 'failed',
          error: prompt.displayText,
        });
        return;
      }

      res.json({
        reference: payment.reference,
        // 'pending'  — approve the prompt on the phone
        // 'send_otp' — the network wants an OTP; POST it to /api/payments/momo/otp
        status: prompt.status,
        needsOtp: prompt.status === 'send_otp',
        message: prompt.displayText,
        amount: value,
        channel: 'mobile_money',
      });
      return;
    }

    // ── Otherwise: hosted checkout, restricted to the channel they picked. ──
    const init = await paystackCheckout({
      email: req.user.email,
      amount: value,
      reference: payment.reference,
      channels: chosen ? [chosen] : undefined,
      metadata: { purpose: kind, orderId: orderId ?? null, userId: req.user.id },
    });

    res.json({
      reference: payment.reference,
      authorizationUrl: init?.authorizationUrl ?? null,
      channel: chosen ?? 'any',
      amount: value,
    });
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Payment could not be started. Please try again.' });
  }
};

/** GET /api/payments/:reference/verify */
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payment = await pay.findByReference(req.params.reference);
    if (!payment) { res.status(404).json({ error: 'Payment not found.' }); return; }
    if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Not authorized.' }); return;
    }

    const verified = await verifyTransaction(payment.reference);
    if (verified?.status === 'success') {
      const result = await pay.settlePayment(payment.reference, (verified as any)?.reference);
      if (result && !result.alreadySettled && result.sellerCredited > 0) {
        await sendReceipt(payment.reference);
      }
      res.json({ status: 'paid', payment: pay.publicPayment(await pay.findByReference(payment.reference)) });
      return;
    }
    res.json({ status: payment.status, payment: pay.publicPayment(payment) });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
};

/**
 * POST /api/payments/paystack/webhook
 * Paystack retries webhooks, so settlement is idempotent: the same reference can
 * arrive many times and the seller is still paid exactly once.
 */
export const paystackWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    // The exact bytes Paystack signed, captured by the express.json() verify hook.
    const rawBody = (req as any).rawBody as string | undefined;

    if (!rawBody) {
      console.error('[paystack] webhook: rawBody missing — the express.json() verify hook is not wired.');
      res.status(400).json({ error: 'Malformed request.' });
      return;
    }

    if (!verifyWebhookSignature(rawBody, signature || '')) {
      res.status(401).json({ error: 'Invalid signature.' });
      return;
    }

    const event = req.body;
    const name: string = event?.event ?? '';
    const data = event?.data ?? {};

    // ── Money in ──
    if (name === 'charge.success') {
      const reference = data.reference;
      const result = await pay.settlePayment(reference, String(data.id ?? ''));
      if (result && !result.alreadySettled) await sendReceipt(reference);

      // Offer them one-tap next time. Paystack gives us a reusable code — never
      // the card number. Failing to save a card must never fail the payment, so
      // this is deliberately swallowed.
      try {
        const auth = extractAuthorization(data);
        const payer = await pay.findByReference(reference);
        if (auth && payer) await po.saveCard(payer.user_id, auth);
      } catch (err: any) {
        console.error('[paystack] could not save card:', err?.message);
      }
    }

    // ── Money out ──
    // The wallet was debited when the payout was requested, so 'success' moves no
    // money — it only records that it landed. A failure or a reversal, though,
    // MUST put the seller's money back, or we have quietly kept it.
    if (name === 'transfer.success') {
      await po.completePayout(data.reference, String(data.id ?? ''));
      await notifyPayout(data.reference, 'paid');
    }

    if (name === 'transfer.failed' || name === 'transfer.reversed') {
      const reason = data.reason || data.gateway_response
        || (name === 'transfer.reversed' ? 'The transfer was reversed.' : 'The transfer failed.');
      const reversed = await po.reversePayout(
        data.reference, name === 'transfer.reversed' ? 'reversed' : 'failed', reason,
      );
      if (reversed) await notifyPayout(data.reference, 'failed', reason);
    }

    // Always 200 quickly, or Paystack will keep retrying.
    res.sendStatus(200);
  } catch (err: any) {
    console.error('[paystack] webhook error:', err?.message);
    res.sendStatus(200);
  }
};

/** The seller gets an itemised receipt telling them who paid, and for what. */
async function sendReceipt(reference: string): Promise<void> {
  try {
    const [row] = await q<any>(
      `SELECT o.id, o.order_number, o.total_amount, o.seller_id,
              b.full_name AS buyer_name, b.phone AS buyer_phone
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         JOIN users  b ON b.id = o.buyer_id
        WHERE p.reference = $1`,
      [reference],
    );
    if (!row) return;

    const items = await ord.getItems(row.id);
    const lines = items
      .map((i: any) => `• ${i.title} × ${Number(i.quantity)} — GHS ${Number(i.subtotal).toLocaleString()}`)
      .join('\n');

    await notify({
      userId: row.seller_id,
      type: 'payment_received',
      title: `🧾 Payment received · ${row.order_number}`,
      message:
        `${row.buyer_name} (${row.buyer_phone || 'no phone'}) paid GHS ` +
        `${Number(row.total_amount).toLocaleString()}.\n\n${lines}\n\n` +
        `Funds are held in escrow and released to you on delivery.`,
      link: '/dashboard',
    });
  } catch (err: any) {
    console.error('[receipt] could not send:', err?.message);
  }
}

/** GET /api/payments/mine */
export const myPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const list = await pay.myPayments(req.user.id);
    res.json({ payments: list.map(pay.publicPayment) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
};

/** POST /api/payments/payout-setup — a seller's Paystack subaccount for splits. */
export const setupPayout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { storeId, subaccountCode } = req.body;
    const rows = await q<any>(
      `UPDATE stores SET paystack_subaccount = $3
        WHERE id = $1::uuid AND owner_id = $2::uuid
        RETURNING id, name, paystack_subaccount`,
      [storeId, req.user.id, subaccountCode],
    );
    if (!rows[0]) { res.status(404).json({ error: 'Store not found, or not yours.' }); return; }
    res.json({ store: rows[0] });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

export const refundPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/admin|finance|cfo|ceo/i.test(req.user.role)) {
      res.status(403).json({ error: 'Finance access required.' }); return;
    }
    const payment = await pay.refund(req.params.reference);
    if (!payment) { res.status(404).json({ error: 'Payment not found, or not refundable.' }); return; }
    res.json({ payment: pay.publicPayment(payment) });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
};

/** POST /api/payments/otp — MoMo prompts sometimes need an OTP. */
export const submitOtp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { submitMomoOtp } = await import('../services/paystackService');
    const { otp, reference } = req.body;
    if (!otp || !reference) { res.status(400).json({ error: 'An OTP and reference are required.' }); return; }

    const result = await submitMomoOtp(otp, reference);
    if (result.status === 'success') {
      const settled = await pay.settlePayment(reference);
      if (settled && !settled.alreadySettled) await sendReceipt(reference);
      res.json({ status: 'paid', message: result.message });
      return;
    }
    res.json({ status: result.status, message: result.message });
  } catch (err: any) { res.status(502).json({ error: err.message }); }
};

export const initiateMomoPayment = initiatePayment;
export const initiateCardPayment = initiatePayment;

/** Tell someone their withdrawal landed — or that we have given the money back. */
async function notifyPayout(
  reference: string, outcome: 'paid' | 'failed', reason?: string,
): Promise<void> {
  try {
    const payout = await po.findPayout(reference);
    if (!payout) return;

    if (outcome === 'paid') {
      await notify({
        userId: payout.user_id,
        type: 'payment_received',
        title: `\u2705 Withdrawal received \u00b7 GHS ${Number(payout.amount).toLocaleString()}`,
        message: `Your money has landed in ${payout.destination}.`,
        link: '/wallet',
      });
      return;
    }

    await notify({
      userId: payout.user_id,
      type: 'system',
      title: `Withdrawal failed \u00b7 GHS ${Number(payout.amount).toLocaleString()}`,
      message:
        `We could not send your money to ${payout.destination}. ` +
        `It has been put back in your wallet, so nothing is lost.` +
        (reason ? `\n\nReason: ${reason}` : ''),
      link: '/wallet',
    });
  } catch (err: any) {
    console.error('[payout] could not notify:', err?.message);
  }
}
