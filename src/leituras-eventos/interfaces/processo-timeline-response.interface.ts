import { TimelineItem } from './timeline-item.interface';

export interface ProcessoTimelineResponse {
  id_processo: number;
  items: TimelineItem[];
  total_items: number;
  generated_at: Date;
}
