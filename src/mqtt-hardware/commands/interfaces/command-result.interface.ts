import { CommandName } from './command-name.interface';
import { CommandQos } from './command-options.interface';

export interface CommandResult {
  comando: CommandName;
  topic: string;
  qos: CommandQos;
  retain: boolean;
  correlation_id: string;
  published_at: Date;
  acknowledged?: boolean;
  ack_status?: 'EXECUTADO';
  ack_received_at?: Date;
  ack_message?: string | null;
  reused_ack?: boolean;
}
