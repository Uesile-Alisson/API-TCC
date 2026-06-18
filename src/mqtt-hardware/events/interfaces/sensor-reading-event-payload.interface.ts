import { Decimal } from '@prisma/client/runtime/client';

export interface SensorReadingEventInput {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_mqtt_mensagem?: number | null;
  valor_vacuo: Decimal;
  leitura_em: Date;
  recebido_em: Date;
}
