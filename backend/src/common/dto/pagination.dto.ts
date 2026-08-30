import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResolvedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function isPaginationRequested(query?: PaginationQueryDto) {
  return Boolean(
    query && (query.page !== undefined || query.pageSize !== undefined),
  );
}

export function resolvePagination(
  query?: PaginationQueryDto,
): ResolvedPagination {
  const page = query?.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(query?.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  pagination: ResolvedPagination,
): PaginatedResult<T> {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(total / pagination.pageSize),
  };
}
