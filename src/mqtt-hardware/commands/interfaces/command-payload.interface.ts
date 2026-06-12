import { CommandName } from './command-name.interface';
import { CommandParams } from './command-params.interface';

export interface CommandPayload<TParams extends CommandParams = CommandParams> {
  comando: CommandName;
  correlation_id: string;
  enviado_em: Date;
  solicitado_por: number | null;
  motivo: string | null;
  parametros: TParams;
}
