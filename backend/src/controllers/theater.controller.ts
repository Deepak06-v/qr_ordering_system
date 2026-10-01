import type { Request, Response } from 'express';
import * as theaterService from '../services/theater.service';
import { asyncHandler } from '../utils/asyncHandler';
import { apiCreated, apiPaginated, apiSuccess } from '../utils/apiResponse';
import type {
  CreateTheaterInput,
  ListTheatersQuery,
  UpdateTheaterInput,
} from '../validators/theater.validator';

type IdParams = { id: string };

export const listTheaters = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListTheatersQuery;

  const { items, total } = await theaterService.listTheaters({
    page: query.page,
    limit: query.limit,
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.city !== undefined ? { city: query.city } : {}),
    ...(query.search !== undefined ? { search: query.search } : {}),
  });

  return apiPaginated(res, items, total, query.page, query.limit);
});

export const createTheater = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateTheaterInput;
  const theater = await theaterService.createTheater(body);
  return apiCreated(res, theater);
});

export const getTheater = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const theater = await theaterService.getTheaterById(id);
  return apiSuccess(res, theater);
});

export const updateTheater = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const body = req.body as UpdateTheaterInput;
  const theater = await theaterService.updateTheater(id, body);
  return apiSuccess(res, theater);
});
