export const TIMELINE_ITEM_TYPES = ['LEITURA', 'EVENTO'] as const;

export type TimelineItemTypeConstant = (typeof TIMELINE_ITEM_TYPES)[number];

export const TIMELINE_SEVERITIES = ['INFO', 'MEDIO', 'CRITICO'] as const;

export type TimelineSeverityConstant = (typeof TIMELINE_SEVERITIES)[number];

export const TIMELINE_DEFAULT_LIMIT = 100;

export const TIMELINE_MAX_LIMIT = 500;

export const TIMELINE_DEFAULT_INCLUDE_LEITURAS = true;

export const TIMELINE_DEFAULT_INCLUDE_EVENTOS = true;
