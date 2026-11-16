'use strict';
const { z, objectId, optStr, pageQuery } = require('./common');
const { ORDER_STATUS } = require('../config/constants');

const placeBody = z
  .object({
    productId: objectId,
    quantity: z.coerce.number().int().min(1).max(50).default(1),
    paymentMethod: z.enum(['cod', 'offline']).default('cod'), // no gateway: the platform never handles money (BR-10)
    deliveryArea: optStr(150), // area only, never an exact address (BR-08)
    notes: optStr(500),
  })
  .strict();

const listQuery = z.object({ ...pageQuery, as: z.enum(['buyer', 'seller']).optional(), status: z.enum(ORDER_STATUS).optional() }).strict();
const statusBody = z.object({ status: z.enum(['confirmed', 'ready', 'delivered', 'completed']) }).strict();
const cancelBody = z.object({ reason: optStr(500) }).strict();

module.exports = { placeBody, listQuery, statusBody, cancelBody };
