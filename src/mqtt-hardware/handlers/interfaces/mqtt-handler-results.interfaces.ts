import {
  origemalarme,
  severidadealarme,
  StatusAcoplamentoMangueira,
  statusalarme,
  statusgeralsistema,
  tipoalarme,
} from '@prisma/client';

export interface MqttAlarmHandlerResult {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  origem_alarme: origemalarme;
  valor_detectado: number | null;
  unidade: string | null;
  ocorrido_em: Date;
  resolvido_em: Date | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
  topic: string;
}

export interface MqttReadingHandlerResult {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_processo: number;
  id_tanque: number;
  id_sensor: number;
  valor_vacuo: number;
  leitura_em: Date;
  recebido_em: Date;
  topic: string;
}

export interface MqttHeartbeatHandlerResult {
  device_id: string | null;
  esp32_online: boolean;
  heartbeat_at: Date;
  receivedAt: Date;
  topic: string;
}

export interface MqttStatusHandlerResult {
  esp32_online: boolean;
  status_geral_sistema: statusgeralsistema;
  mensagem: string | null;
  device_id: string | null;
  status_em: Date;
  receivedAt: Date;
  topic: string;
  status_changed: boolean;
}

export interface MqttAcoplamentoMangueiraHandlerResult {
  id_sensor: number;
  id_tanque: number;
  sinal_detectado: boolean;
  status_acoplamento: StatusAcoplamentoMangueira;
  verificado_em: Date;
  topic: string;
  receivedAt: Date;
  status_anterior: StatusAcoplamentoMangueira;
  status_mudou: boolean;
}
