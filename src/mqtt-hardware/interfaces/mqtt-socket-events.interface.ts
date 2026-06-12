import {
  origemalarme,
  severidadealarme,
  statusalarme,
  statusconexaomqtt,
  statusgeralsistema,
  tipoalarme,
} from '@prisma/client';

export interface SocketBasePayload {
  enviado_em?: Date;
}

export interface MqttConnectionStatusSocketPayload extends SocketBasePayload {
  status_conexao: statusconexaomqtt;
  error: string | null;
}

export interface MqttErrorSocketPayload extends SocketBasePayload {
  error: string;
}

export interface SensorReadingSocketPayload extends SocketBasePayload {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_processo: number;
  id_tanque: number;
  id_sensor: number;
  valor_vacuo: string;
  leitura_em: Date;
  recebido_em: Date;
  topic: string;
}

export interface HardwareStatusSocketPayload extends SocketBasePayload {
  status_geral_sistema: statusgeralsistema;
  mensagem: string | null;
  device_id: string | null;
  status_em: Date;
  receivedAt: Date;
  topic: string;
}

export interface HeartbeatSocketPayload extends SocketBasePayload {
  device_id: string | null;
  heartbeat_at: Date;
  receivedAt: Date;
  topic: string;
}

export interface AlarmCreatedSocketPayload extends SocketBasePayload {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  origem_alarme: origemalarme;
  valor_detectado: string | null;
  unidade: string | null;
  ocorrido_em: Date;
  resolvido_em: Date | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
  topic: string;
}

export interface SensorAcoplamentoSocketPayload extends SocketBasePayload {
  id_sensor: number;
  id_tanque: number;
  sinal_detectado: boolean;
  status_acoplamento: string;
  verificado_em: Date;
  topic: string;
  receivedAt: Date;
}
