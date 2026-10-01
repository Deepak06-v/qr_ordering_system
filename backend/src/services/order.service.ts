import { Types } from 'mongoose';
import { MenuItem } from '../models/MenuItem';
import { Order } from '../models/Order';
import { Payment, type PaymentProvider } from '../models/Payment';
import { canTransition, type OrderStatus, type PaymentStatus } from '../models/order-status';
import { ApiError, ErrorCode } from '../utils/apiError';
import { logger } from '../utils/logger';
import type { EntityId } from '../utils/mongo';
import { nextOrderNumber } from './order-number.service';
import { getPaymentService } from './payment/payment.service';
import { createVerificationPin } from './pin.service';
import { resolveSeatHash } from './seatHash.service';
import {
  emitOrderCancelled,
  emitOrderNew,
  emitOrderUpdated,
  type OrderEventPayload,
} from './realtime.service';

/* -------------------------------------------------------------------------- */
/*                                   DTOs                                      */
/* -------------------------------------------------------------------------- */

export interface OrderItemDTO {
  itemId: string;
  name: string;
  quantity: number;
  /** Integer paise, snapshotted from the menu at order time. */
  price: number;
}

export interface OrderDTO {
  orderId: string;
  orderNumber: string;
  theaterId: string;
  screenNumber: number;
  seatNumber: string;
  items: OrderItemDTO[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  /**
   * The plaintext delivery PIN.
   *
   * Returned exactly once, in the payment-confirmation response. It is never
   * included by `getOrderById` or `listOrders` - only the scrypt hash is stored,
   * so there is nothing to return later even if we wanted to.
   */
  verificationPin?: string;
}

export interface CreateOrderItemInput {
  itemId: EntityId;
  quantity: number;
}

export interface CreateOrderInput {
  /** The scanned QR hash. The seat is derived from this and nothing else. */
  hash: string;
  items: CreateOrderItemInput[];
}

export interface ListOrdersParams {
  theaterId: string;
  screenNumber?: number;
  status?: OrderStatus;
  limit: number;
  skip: number;
}

export interface ListOrdersResult {
  items: OrderDTO[];
  total: number;
  limit: number;
  skip: number;
}

/* -------------------------------------------------------------------------- */
/*                               Internal shapes                               */
/* -------------------------------------------------------------------------- */

/**
 * Explicit lean projections.
 *
 * `InferSchemaType` models a document's fields as optional (Mongoose cannot know
 * a `required: true` was honoured), which turns every DTO builder into a pile of
 * non-null assertions. These shapes state what the database actually guarantees.
 */
type LeanOrder = {
  _id: Types.ObjectId;
  orderNumber: string;
  theaterId: Types.ObjectId;
  seatDetails: { screenNumber: number; seatNumber: string };
  items: Array<{ itemId: Types.ObjectId; name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
};

type LeanPayment = {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  theaterId: Types.ObjectId;
  provider: PaymentProvider;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
};

const CURRENCY = 'INR';

/**
 * The customer-facing projection.
 *
 * Note what is NOT here: `hash` (the seat's secret), `theaterId` is included but
 * the QR is not, and `verificationPinHash` is `select: false` on the schema and
 * never copied in. This function is the only place an OrderDTO is built, so that
 * is the single place the PIN can leak from - and it only accepts the PIN as an
 * explicit argument.
 */
function toOrderDTO(doc: LeanOrder, verificationPin?: string): OrderDTO {
  return {
    orderId: doc._id.toString(),
    orderNumber: doc.orderNumber,
    theaterId: doc.theaterId.toString(),
    screenNumber: doc.seatDetails.screenNumber,
    seatNumber: doc.seatDetails.seatNumber,
    items: doc.items.map((item) => ({
      itemId: item.itemId.toString(),
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    totalAmount: doc.totalAmount,
    currency: CURRENCY,
    status: doc.status,
    paymentStatus: doc.paymentStatus,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(doc.paidAt ? { paidAt: doc.paidAt } : {}),
    ...(verificationPin ? { verificationPin } : {}),
  };
}

function toEventPayload(doc: LeanOrder, verificationPin?: string): OrderEventPayload {
  return {
    orderId: doc._id.toString(),
    orderNumber: doc.orderNumber,
    theaterId: doc.theaterId.toString(),
    screenNumber: doc.seatDetails.screenNumber,
    seatNumber: doc.seatDetails.seatNumber,
    items: doc.items.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })),
    totalAmount: doc.totalAmount,
    status: doc.status,
    createdAt: doc.createdAt,
    ...(verificationPin ? { verificationPin } : {}),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

async function findLeanOrderById(id: EntityId): Promise<LeanOrder | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return Order.findById(id).lean<LeanOrder>().exec();
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates an order in `PENDING_PAYMENT`.
 *
 * The client is trusted with exactly three things: the QR hash it scanned, which
 * item ids it wants, and how many of each. Prices, item names, the seat, the
 * theater and the total are all resolved server-side - a client that sends a
 * price is ignored, not obeyed, because there is no field for one to land in.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderDTO> {
  // Throws QR_NOT_FOUND / QR_INACTIVE, and 410s an inactive theater.
  const seat = await resolveSeatHash(input.hash);

  const requestedIds = input.items.map((item) => item.itemId);
  const menuItems = await MenuItem.find({ _id: { $in: requestedIds } }).lean().exec();
  const menuById = new Map(menuItems.map((item) => [item._id.toString(), item]));

  const items = input.items.map(({ itemId, quantity }) => {
    const itemIdString = itemId.toString();
    const menuItem = menuById.get(itemIdString);
    if (!menuItem) {
      throw ApiError.badRequest(
        `Menu item ${itemIdString} does not exist`,
        ErrorCode.MENU_ITEM_NOT_FOUND,
      );
    }
    if (menuItem.theaterId.toString() !== seat.theaterId) {
      // A client must not be able to order another cinema's menu.
      throw ApiError.badRequest(
        `Menu item "${menuItem.name}" is not available at this theater`,
        ErrorCode.MENU_ITEM_WRONG_THEATER,
      );
    }
    if (!menuItem.isAvailable) {
      throw ApiError.badRequest(
        `Menu item "${menuItem.name}" is sold out`,
        ErrorCode.MENU_ITEM_UNAVAILABLE,
      );
    }

    return {
      itemId: menuItem._id,
      name: menuItem.name,
      quantity,
      price: menuItem.price,
    };
  });

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderNumber = await nextOrderNumber();

  const created = await Order.create({
    orderNumber,
    hash: seat.hash,
    theaterId: new Types.ObjectId(seat.theaterId),
    seatDetails: { screenNumber: seat.screenNumber, seatNumber: seat.seatNumber },
    items,
    totalAmount,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
  });

  const doc = created.toObject() as LeanOrder;

  // No realtime emit here: the kitchen has nothing to do until money has moved.
  // `order:new` is emitted by payment verification, once, and never twice.
  return toOrderDTO(doc);
}

/* -------------------------------------------------------------------------- */
/*                                    Read                                     */
/* -------------------------------------------------------------------------- */

export async function getOrderById(id: EntityId): Promise<OrderDTO> {
  const doc = await findLeanOrderById(id);
  if (!doc) {
    throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
  }
  return toOrderDTO(doc);
}

export async function listOrders(params: ListOrdersParams): Promise<ListOrdersResult> {
  if (!Types.ObjectId.isValid(params.theaterId)) {
    throw ApiError.badRequest('theaterId must be a valid id', ErrorCode.VALIDATION_ERROR);
  }

  const filter: Record<string, unknown> = { theaterId: new Types.ObjectId(params.theaterId) };
  if (params.status) {
    filter.status = params.status;
  }
  if (params.screenNumber !== undefined) {
    filter['seatDetails.screenNumber'] = params.screenNumber;
  }

  const [docs, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(params.skip)
      .limit(params.limit)
      .lean<LeanOrder[]>()
      .exec(),
    Order.countDocuments(filter).exec(),
  ]);

  return {
    items: docs.map((doc) => toOrderDTO(doc)),
    total,
    limit: params.limit,
    skip: params.skip,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Status transitions                             */
/* -------------------------------------------------------------------------- */

/**
 * Applies a staff status change.
 *
 * Enforces the transition table, so `DELIVERED`/`CANCELLED` are terminal and
 * `PENDING_PAYMENT` is unreachable from outside payment verification.
 */
export async function updateOrderStatus(id: EntityId, next: OrderStatus): Promise<OrderDTO> {
  const current = await findLeanOrderById(id);
  if (!current) {
    throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
  }

  if (current.status === next) {
    // Idempotent no-op. Re-reporting the current state should not be an error -
    // a flaky KDS client retrying is a realistic case.
    return toOrderDTO(current);
  }

  if (!canTransition(current.status, next)) {
    throw ApiError.conflict(
      `An order that is ${current.status} cannot become ${next}`,
      ErrorCode.INVALID_STATUS_TRANSITION,
    );
  }

  const updated = await Order.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status: next } },
    { new: true },
  )
    .lean<LeanOrder | null>()
    .exec();

  if (!updated) {
    // Lost the race: another request moved the order out from under us. Surface
    // the truth rather than pretending the transition happened.
    const latest = await findLeanOrderById(current._id);
    throw ApiError.conflict(
      `Order status changed concurrently (now ${latest?.status ?? 'unknown'})`,
      ErrorCode.INVALID_STATUS_TRANSITION,
    );
  }

  if (next === 'CANCELLED') {
    emitOrderCancelled(toEventPayload(updated));
  } else {
    emitOrderUpdated(toEventPayload(updated));
  }

  return toOrderDTO(updated);
}

/* -------------------------------------------------------------------------- */
/*                                   Payment                                   */
/* -------------------------------------------------------------------------- */

export interface CreatePaymentDTO {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'PENDING';
  provider: string;
  /** True while the provider is the no-money simulation. Surfaced so the client can label it. */
  simulated: boolean;
}

export interface VerifyPaymentDTO {
  order: OrderDTO;
  /** Present only on the response that actually completes the order. */
  verificationPin?: string;
  /** True when the call found the order already paid and returned it as-is. */
  alreadyCompleted: boolean;
}

async function loadPayableOrder(id: EntityId): Promise<LeanOrder> {
  const order = await findLeanOrderById(id);
  if (!order) {
    throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
  }
  if (order.status !== 'PENDING_PAYMENT' || order.paymentStatus === 'COMPLETED') {
    throw ApiError.conflict(
      `Order ${order.orderNumber} is ${order.status} and cannot be paid again`,
      order.paymentStatus === 'COMPLETED' || order.status !== 'PENDING_PAYMENT'
        ? ErrorCode.ORDER_ALREADY_PAID
        : ErrorCode.ORDER_NOT_PAYABLE,
    );
  }
  return order;
}

/**
 * Opens a payment attempt.
 *
 * Idempotent: if this order already has an in-flight payment (a double tap, or
 * a client that lost its response and retried) the existing one is returned
 * rather than opening a second charge. The partial unique index on Payment is
 * what makes that safe under concurrency; the pre-check is only a fast path.
 */
export async function createPayment(orderId: EntityId): Promise<CreatePaymentDTO> {
  const order = await loadPayableOrder(orderId);
  const orderIdString = order._id.toString();

  const existing = await Payment.findOne({ orderId: order._id, status: 'PENDING' })
    .lean<LeanPayment>()
    .exec();

  if (existing) {
    return {
      orderId: orderIdString,
      orderNumber: order.orderNumber,
      paymentId: existing.providerPaymentId,
      amount: existing.amount,
      currency: existing.currency,
      status: 'PENDING',
      provider: existing.provider,
      simulated: getPaymentService().isSimulation,
    };
  }

  const created = await getPaymentService().createPayment({
    orderId: orderIdString,
    orderNumber: order.orderNumber,
    theaterId: order.theaterId.toString(),
    amount: order.totalAmount,
    currency: CURRENCY,
  });

  try {
    const payment = await Payment.create({
      orderId: order._id,
      theaterId: order.theaterId,
      provider: created.provider,
      providerPaymentId: created.paymentId,
      amount: created.amount,
      currency: created.currency,
      status: created.status,
    });

    return {
      orderId: orderIdString,
      orderNumber: order.orderNumber,
      paymentId: payment.providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: 'PENDING',
      provider: payment.provider,
      simulated: getPaymentService().isSimulation,
    };
  } catch (error) {
    if (isDuplicateKey(error)) {
      // Lost the race against a concurrent create. Adopt the winner's payment
      // instead of failing: the client ends up with one usable payment id.
      const winner = await Payment.findOne({ orderId: order._id, status: 'PENDING' })
        .lean<LeanPayment>()
        .exec();

      if (winner) {
        return {
          orderId: orderIdString,
          orderNumber: order.orderNumber,
          paymentId: winner.providerPaymentId,
          amount: winner.amount,
          currency: winner.currency,
          status: 'PENDING',
          provider: winner.provider,
          simulated: getPaymentService().isSimulation,
        };
      }
    }
    throw error;
  }
}

/**
 * Moves the order to PAID and returns the delivery PIN, exactly once.
 *
 * Concurrency and crash safety:
 *  - The payment is claimed with a conditional `PENDING -> COMPLETED` update.
 *    Whoever wins that update is the one that generates the PIN, so a PIN is
 *    never generated twice and never orphaned on a second row.
 *  - If the payment is already COMPLETED but the order is still unpaid (a crash
 *    between the two writes), this self-heals: the order is completed and a
 *    fresh PIN issued, because the original was never handed to anyone.
 *  - The customer sees the PIN only in the response of the request that
 *    completed the order. Later retries get the order back without a PIN.
 */
export async function verifyPayment(
  orderId: EntityId,
  paymentId: string,
): Promise<VerifyPaymentDTO> {
  const order = await findLeanOrderById(orderId);
  if (!order) {
    throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
  }

  if (order.paymentStatus === 'COMPLETED') {
    // Already paid. Return the current state; there is no plaintext PIN to
    // return, and issuing a new one would invalidate the KDS's copy.
    return { order: toOrderDTO(order), alreadyCompleted: true };
  }

  if (order.status !== 'PENDING_PAYMENT') {
    throw ApiError.conflict(
      `Order ${order.orderNumber} is ${order.status} and is not awaiting payment`,
      ErrorCode.ORDER_NOT_PAYABLE,
    );
  }

  const payment = await Payment.findOne({ providerPaymentId: paymentId })
    .lean<LeanPayment>()
    .exec();

  if (!payment) {
    throw ApiError.notFound('Payment not found', ErrorCode.PAYMENT_NOT_FOUND);
  }
  if (payment.orderId.toString() !== order._id.toString()) {
    // Stops one order's payment id from paying for a different order.
    throw ApiError.badRequest(
      'This payment does not belong to this order',
      ErrorCode.PAYMENT_WRONG_ORDER,
    );
  }
  if (payment.amount !== order.totalAmount) {
    throw ApiError.conflict(
      'Payment amount does not match the order total',
      ErrorCode.PAYMENT_AMOUNT_MISMATCH,
    );
  }
  if (payment.status === 'COMPLETED') {
    // Paid but the order write was lost. Fall through and repair.
    return completePaidOrder(order, payment);
  }
  if (payment.status !== 'PENDING') {
    throw ApiError.conflict(
      `Payment is ${payment.status} and cannot be verified`,
      ErrorCode.PAYMENT_NOT_PENDING,
    );
  }

  const result = await getPaymentService().verifyPayment({
    orderId: order._id.toString(),
    paymentId,
    expectedAmount: order.totalAmount,
    currency: CURRENCY,
  });

  if (!result.verified) {
    // Mark it failed so the client can start a fresh attempt, and never leave
    // the order payable against a dead payment id.
    await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'PENDING' },
      {
        $set: {
          status: 'FAILED',
          metadata: { reason: result.reason, ...(result.metadata ?? {}) },
        },
      },
    ).exec();

    logger.warn('Payment verification declined by provider', {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      reason: result.reason,
    });

    throw ApiError.badRequest(
      'Payment could not be verified',
      ErrorCode.INVALID_PAYMENT,
      { reason: result.reason },
    );
  }

  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'PENDING' },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: new Date(),
        metadata: result.metadata ?? undefined,
      },
    },
    { new: true },
  )
    .lean<LeanPayment | null>()
    .exec();

  if (!claimed) {
    // Another request completed this payment between our read and our write.
    // The winner already emitted `order:new` and already handed over the PIN.
    const latest = await findLeanOrderById(order._id);
    if (latest && latest.paymentStatus === 'COMPLETED') {
      return { order: toOrderDTO(latest), alreadyCompleted: true };
    }
    // Paid, but the order write is still missing. Repair it.
    return completePaidOrder(order, payment);
  }

  return completePaidOrder(order, claimed);
}

/**
 * Final step of payment: generate the PIN, mark the order PAID, announce it to
 * the kitchen. Shared by the normal path and the self-heal path.
 */
async function completePaidOrder(
  order: LeanOrder,
  payment: LeanPayment,
): Promise<VerifyPaymentDTO> {
  const { plaintext, hash } = createVerificationPin();
  const now = new Date();

  const paid = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $ne: 'COMPLETED' } },
    {
      $set: {
        status: 'PAID',
        paymentStatus: 'COMPLETED',
        paidAt: now,
        verificationPinHash: hash,
      },
    },
    { new: true },
  )
    .lean<LeanOrder | null>()
    .exec();

  if (!paid) {
    // Someone completed the order while we were generating the PIN. Our PIN was
    // never stored and never sent, so discarding it is safe.
    const latest = await findLeanOrderById(order._id);
    if (!latest) {
      throw ApiError.notFound('Order not found', ErrorCode.ORDER_NOT_FOUND);
    }
    return { order: toOrderDTO(latest), alreadyCompleted: true };
  }

  emitOrderNew(toEventPayload(paid, plaintext));

  logger.info('Order paid', {
    orderId: paid._id.toString(),
    orderNumber: paid.orderNumber,
    theaterId: paid.theaterId.toString(),
    amount: paid.totalAmount,
    provider: payment.provider,
  });

  return {
    order: toOrderDTO(paid),
    verificationPin: plaintext,
    alreadyCompleted: false,
  };
}
