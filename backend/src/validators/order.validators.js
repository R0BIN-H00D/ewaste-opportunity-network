'use strict';
const { z, objectId, optStr, pageQuery } = require('./common');
const { ORDER_STATUS } = require('../config/constants');

const placeBody = z
  .object({
    productId: objectId,
    quantity: z.coerce.number().int().min(1).max(50).default(1),
    paymentMethod: z.enum(['cod', 'offline', 'online']).default('cod'), // online = Razorpay test mode (demo only)
    // Where it goes: area, city and pincode are all required so every order can actually be delivered. Area only, never an exact address (BR-08).
    deliveryArea: z.string({ required_error: 'Enter the area to deliver to' }).trim().min(3, 'Enter the area or locality to deliver to').max(150).regex(/[A-Za-z]/, 'The area must contain letters'),
    deliveryCity: z.string({ required_error: 'Enter the city' }).trim().min(2, 'Enter the city').max(80).regex(/^[A-Za-z][A-Za-z .'-]*$/, 'The city can only have letters'),
    deliveryPincode: z.string({ required_error: 'Enter the 6-digit pincode' }).trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode'),
    notes: optStr(500),
  })
  .strict();

const listQuery = z.object({ ...pageQuery, as: z.enum(['buyer', 'seller']).optional(), status: z.enum(ORDER_STATUS).optional() }).strict();
const statusBody = z.object({ status: z.enum(['confirmed', 'ready', 'delivered', 'completed']) }).strict();
const cancelBody = z.object({ reason: optStr(500) }).strict();

const verifyBody = z
  .object({
    razorpay_order_id: z.string().min(5).max(100),
    razorpay_payment_id: z.string().min(5).max(100),
    razorpay_signature: z.string().min(10).max(200),
  })
  .strict();

module.exports = { verifyBody, placeBody, listQuery, statusBody, cancelBody };
