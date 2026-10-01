import { Router } from 'express';
import * as controller from '../controllers/seatHash.controller';
import { validate } from '../middleware/validation.middleware';
import {
  bulkCreateSeatHashSchema,
  createSeatHashSchema,
  exportSeatHashSchema,
  listSeatHashesQuerySchema,
  remapSeatHashSchema,
  seatHashParamsSchema,
  setSeatHashStatusSchema,
} from '../validators/seatHash.validator';

export const seatHashRouter = Router();

seatHashRouter.post(
  '/export',
  validate({ body: exportSeatHashSchema }),
  controller.exportSeatHashes,
);

/* --------------------------------- create --------------------------------- */

seatHashRouter.post('/', validate({ body: createSeatHashSchema }), controller.createSeatHash);

seatHashRouter.post(
  '/bulk',
  validate({ body: bulkCreateSeatHashSchema }),
  controller.bulkCreateSeatHashes,
);

/** Declared before `/:hash` so it is not swallowed by the param route. */
seatHashRouter.get('/', validate({ query: listSeatHashesQuerySchema }), controller.listSeatHashes);

/* ---------------------------------- images -------------------------------- */

seatHashRouter.get(
  '/:hash/qr',
  validate({ params: seatHashParamsSchema }),
  controller.downloadQrPng,
);

seatHashRouter.get(
  '/:hash/qr.svg',
  validate({ params: seatHashParamsSchema }),
  controller.downloadQrSvg,
);

seatHashRouter.get(
  '/:hash/qr/data-url',
  validate({ params: seatHashParamsSchema }),
  controller.getQrDataUrl,
);

/* --------------------------------- remap ---------------------------------- */

seatHashRouter.patch(
  '/:hash',
  validate({ params: seatHashParamsSchema, body: remapSeatHashSchema }),
  controller.remapSeatHash,
);

seatHashRouter.patch(
  '/:hash/status',
  validate({ params: seatHashParamsSchema, body: setSeatHashStatusSchema }),
  controller.setSeatHashStatus,
);

/* -------------------------------- resolve --------------------------------- */

seatHashRouter.get(
  '/:hash',
  validate({ params: seatHashParamsSchema }),
  controller.resolveSeatHash,
);
