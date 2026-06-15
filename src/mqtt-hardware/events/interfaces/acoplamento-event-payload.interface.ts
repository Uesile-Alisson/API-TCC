import { StatusAcoplamentoMangueira } from '@prisma/client';

export interface AcoplamentoEventInput {
  id_mqtt_mensagem?: number | null;
  id_sensor: number;
  id_tanque: number;
  status_acoplamento: StatusAcoplamentoMangueira;
  status_anterior?: StatusAcoplamentoMangueira | null;
  sinal_detectado: boolean;
  status_mudou: boolean;
  ultima_verificacao: Date;
}
