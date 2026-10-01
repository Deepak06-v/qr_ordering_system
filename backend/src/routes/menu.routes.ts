import { Router } from 'express';
import * as controller from '../controllers/menu.controller';
import { validate } from '../middleware/validation.middleware';
import {
  createMenuItemSchema,
  listMenuQuerySchema,
  menuItemIdParamsSchema,
  theaterIdParamsSchema,
  updateMenuItemSchema,
} from '../validators/menu.validator';

export const menuRouter = Router();

/**
 * NOTE: these are development / admin endpoints. This product has no customer
 * accounts, so there is no customer authentication anywhere in the system.
 */

menuRouter.get(
  '/:theaterId',
  validate({ params: theaterIdParamsSchema, query: listMenuQuerySchema }),
  controller.listMenu,
);

menuRouter.post('/', validate({ body: createMenuItemSchema }), controller.createMenuItem);

menuRouter.get('/items/:id', validate({ params: menuItemIdParamsSchema }), controller.getMenuItem);

menuRouter.patch(
  '/items/:id',
  validate({ params: menuItemIdParamsSchema, body: updateMenuItemSchema }),
  controller.updateMenuItem,
);

menuRouter.delete(
  '/items/:id',
  validate({ params: menuItemIdParamsSchema }),
  controller.deleteMenuItem,
);
