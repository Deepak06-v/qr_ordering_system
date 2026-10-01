import type { Request, Response } from 'express';
import * as menuService from '../services/menu.service';
import { asyncHandler } from '../utils/asyncHandler';
import { apiCreated, apiSuccess } from '../utils/apiResponse';
import type {
  CreateMenuItemInput,
  ListMenuQuery,
  UpdateMenuItemInput,
} from '../validators/menu.validator';

type IdParams = { id: string };
type TheaterParams = { theaterId: string };

export const listMenu = asyncHandler(async (req: Request, res: Response) => {
  const { theaterId } = req.params as unknown as TheaterParams;
  const query = req.query as unknown as ListMenuQuery;

  const items = await menuService.listMenuItems({
    theaterId,
    ...(query.category !== undefined ? { category: query.category } : {}),
    ...(query.isAvailable !== undefined ? { isAvailable: query.isAvailable } : {}),
    ...(query.includeUnavailable !== undefined
      ? { includeUnavailable: query.includeUnavailable }
      : {}),
  });

  return apiSuccess(res, items);
});

export const createMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateMenuItemInput;
  const item = await menuService.createMenuItem(body);
  return apiCreated(res, item);
});

export const getMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const item = await menuService.getMenuItemById(id);
  return apiSuccess(res, item);
});

export const updateMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const body = req.body as UpdateMenuItemInput;
  const item = await menuService.updateMenuItem(id, body);
  return apiSuccess(res, item);
});

export const deleteMenuItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as IdParams;
  const result = await menuService.deleteMenuItem(id);
  return apiSuccess(res, result);
});
