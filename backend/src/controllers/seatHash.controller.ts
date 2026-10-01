import type { Request, Response } from 'express';
import * as seatHashService from '../services/seatHash.service';
import { generateQrDataUrl, generateQrPng, generateQrSvg } from '../services/qr.service';
import { asyncHandler } from '../utils/asyncHandler';
import { apiCreated, apiCreatedMany, apiPaginated, apiSuccess } from '../utils/apiResponse';
import type {
  BulkCreateSeatHashInput,
  CreateSeatHashInput,
  ExportSeatHashInput,
  ListSeatHashesQuery,
  RemapSeatHashInput,
  SeatHashParams,
  SetSeatHashStatusInput,
} from '../validators/seatHash.validator';

/* --------------------------------- create --------------------------------- */

export const createSeatHash = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateSeatHashInput;
  const created = await seatHashService.createSeatHash(body);
  return apiCreated(res, created);
});

export const bulkCreateSeatHashes = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as BulkCreateSeatHashInput;
  const created = await seatHashService.bulkCreateSeatHashes(body);
  return apiCreatedMany(res, created);
});

/* --------------------------------- resolve -------------------------------- */

/**
 * Customer-facing resolution. The hash in the URL is the sole source of truth
 * for the seat - a scanned sticker decides where the order is delivered.
 */
export const resolveSeatHash = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  const resolved = await seatHashService.resolveSeatHash(hash);
  return apiSuccess(res, resolved);
});

/* ---------------------------------- images -------------------------------- */

export const downloadQrPng = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  const mapping = await seatHashService.getSeatHashByHash(hash);

  const png = await generateQrPng(hash);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(png.length));
  res.setHeader('Content-Disposition', `attachment; filename="seat-${mapping.seatNumber}.png"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).end(png);
});

export const downloadQrSvg = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  const mapping = await seatHashService.getSeatHashByHash(hash);

  const svg = await generateQrSvg(hash);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Length', String(Buffer.byteLength(svg)));
  res.setHeader('Content-Disposition', `attachment; filename="seat-${mapping.seatNumber}.svg"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.status(200).send(svg);
});

export const getQrDataUrl = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  await seatHashService.getSeatHashByHash(hash);

  const dataUrl = await generateQrDataUrl(hash);
  return apiSuccess(res, { hash, dataUrl });
});

/* ------------------------------ admin listing ----------------------------- */

export const listSeatHashes = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSeatHashesQuery;

  const { items, total } = await seatHashService.listSeatHashes({
    theaterId: query.theaterId,
    page: query.page,
    limit: query.limit,
    ...(query.screenNumber !== undefined ? { screenNumber: query.screenNumber } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  });

  return apiPaginated(res, items, total, query.page, query.limit);
});

/* ---------------------------- remap / deactivate --------------------------- */

export const remapSeatHash = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  const body = req.body as RemapSeatHashInput;
  const updated = await seatHashService.remapSeatHash(hash, body);
  return apiSuccess(res, updated);
});

export const setSeatHashStatus = asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.params as unknown as SeatHashParams;
  const body = req.body as SetSeatHashStatusInput;
  const updated = await seatHashService.setSeatHashStatus(hash, body.isActive, body.reason);
  return apiSuccess(res, updated);
});

/* --------------------------------- export --------------------------------- */

export const exportSeatHashes = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ExportSeatHashInput;
  const { stream, filename, count } = await seatHashService.exportSeatHashesZip(body);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-QR-Count', String(count));

  return new Promise<void>((resolve, reject) => {
    stream.on('error', reject);
    res.on('error', reject);
    stream.pipe(res);
    res.on('finish', resolve);
  });
});
