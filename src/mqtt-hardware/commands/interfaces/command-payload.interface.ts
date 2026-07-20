import { CommandName } from './command-name.interface';
import { CommandParams } from './command-params.interface';
import { ESP32_MQTT_SCHEMA_VERSION } from '../../interfaces/esp32-contracts.interface';

export interface CommandPayload<TParams extends CommandParams = CommandParams> {
  tipo: 'COMANDO';
  schema_version: typeof ESP32_MQTT_SCHEMA_VERSION;
  comando: CommandName;
  correlation_id: string;
  enviado_em: string;
  id_processo?: number;
  solicitado_por: number | null;
  motivo: string | null;
  parametros: TParams;
}
