export type CommandQos = 0 | 1 | 2;

export interface CommandOptions {
  qos?: CommandQos;
  retain?: boolean;
  solicitado_por?: number | null;
  motivo?: string | null;
  correlation_id?: string;
}
