import { EventProcessingStatus } from '../enums';

export interface EventResult {
  status: EventProcessingStatus;
  message: string;
  id_evento_processo?: number | null;
  id_alarme?: number;
  emergencyStopSent?: boolean;
  socketEmitted?: boolean;
  operationalLogCreated?: boolean;
  error?: string;
}
