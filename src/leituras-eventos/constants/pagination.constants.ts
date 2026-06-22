export const DEFAULT_PAGE = 1;

export const DEFAULT_LIMIT = 20;

export const MAX_LIMIT = 100;

export const MIN_PAGE = 1;

export const MIN_LIMIT = 1;

export const ORDER_DIRECTIONS = ['asc', 'desc'] as const;

export type OrderDirection = (typeof ORDER_DIRECTIONS)[number];

export const DEFAULT_ORDER_DIRECTION: OrderDirection = 'desc';
