import { BadRequestException } from '@nestjs/common';

export function normalizeSearch(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function validateOrderBy<TOrderBy extends string>(
  orderBy: TOrderBy | undefined,
  allowedFields: readonly TOrderBy[],
  entityName: string,
): TOrderBy | undefined {
  if (orderBy === undefined) {
    return undefined;
  }

  if (!allowedFields.includes(orderBy)) {
    throw new BadRequestException(
      `order_by invalido para ${entityName}: ${orderBy}.`,
    );
  }

  return orderBy;
}

export function buildPagination(page = 1, limit = 20) {
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}
