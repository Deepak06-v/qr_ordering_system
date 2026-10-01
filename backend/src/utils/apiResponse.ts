import type { Response } from 'express';

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export interface ApiSuccessWithMetaBody<T> {
  success: true;
  count: number;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function apiSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiSuccessBody<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function apiCreated<T>(res: Response, data: T): Response {
  return apiSuccess(res, data, 201);
}

export function apiCreatedMany<T>(res: Response, data: T[]): Response {
  const body: ApiSuccessWithMetaBody<T[]> = { success: true, count: data.length, data };
  return res.status(201).json(body);
}

export function apiPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
): Response {
  const data: PaginatedData<T> = {
    items,
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
  return apiSuccess(res, data);
}
