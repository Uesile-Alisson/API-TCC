export type TimelineItemType = 'LEITURA' | 'EVENTO';

export type TimelineItemSeverity = 'INFO' | 'MEDIO' | 'CRITICO' | null;

export interface TimelineItem {
  type: TimelineItemType;
  timestamp: Date;
  id: number;
  title: string;
  description: string | null;
  severity: TimelineItemSeverity;
  value: number | null;
  unit: string | null;
  metadata: Record<string, unknown> | null;
}
