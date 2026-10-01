import { Router } from 'express';
import * as controller from '../controllers/theater.controller';
import { validate } from '../middleware/validation.middleware';
import {
  createTheaterSchema,
  listTheatersQuerySchema,
  theaterIdParamsSchema,
  updateTheaterSchema,
} from '../validators/theater.validator';

export const theaterRouter = Router();

theaterRouter.get('/', validate({ query: listTheatersQuerySchema }), controller.listTheaters);

theaterRouter.post('/', validate({ body: createTheaterSchema }), controller.createTheater);

theaterRouter.get('/:id', validate({ params: theaterIdParamsSchema }), controller.getTheater);

theaterRouter.patch(
  '/:id',
  validate({ params: theaterIdParamsSchema, body: updateTheaterSchema }),
  controller.updateTheater,
);
