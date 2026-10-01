import { Router } from 'express';
import { theaterRouter } from './theater.routes';
import { seatHashRouter } from './seatHash.routes';
import { menuRouter } from './menu.routes';
import { orderRouter } from './order.routes';

export const apiRouter = Router();

apiRouter.use('/theaters', theaterRouter);
apiRouter.use('/seat-hashes', seatHashRouter);
apiRouter.use('/menu', menuRouter);
apiRouter.use('/orders', orderRouter);
