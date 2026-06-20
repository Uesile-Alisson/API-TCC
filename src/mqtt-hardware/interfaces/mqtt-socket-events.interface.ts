import {
  origemalarme,
  severidadealarme,
  statusalarme,
  statusconexaomqtt,
  statusgeralsistema,
  tipoalarme,
  StatusAcoplamentoMangueira,
  statusbomba,
} from '@prisma/client';
import { HardwareValveStatusInput } from '../events/interfaces';
import { Decimal } from '@prisma/client/runtime/client';

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
  id_mqtt_mensagem?: number | null;
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: number;
  leitura_em: Date;
  recebido_em: Date;
  id_sensor?: number;
  id_tanque?: number;
}

export interface HardwareStatusSocketPayload extends SocketBasePayload {
  id_mqtt_mensagem: number | null;
  esp32_online: boolean;
  status_bomba_principal: statusbomba | null;
  status_bomba_auxiliar: statusbomba | null;
  status_geral_sistema: statusgeralsistema;
  status_valvulas?: HardwareValveStatusInput[];
  processo_em_execucao: boolean;
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
  erro?: string | null;
  recebido_em: Date;
  enviado_em: Date;
  mensagem: string | null;
  device_id?: string | null;
}

export interface HeartbeatSocketPayload extends SocketBasePayload {
  id_mqtt_mensagem?: number | null;
  esp32_online: boolean;
  uptime_ms?: number | null;
  firmware_version?: string | null;
  receivedAt?: Date;
  lastHeartbeatAt?: Date | null;
  timeoutMs?: Decimal | null;
  checkedAt?: Date;
  processo_em_execucao?: boolean;
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
  device_id?: string | null;
  heartbeat_at: Date | null;
}

export interface AlarmCreatedSocketPayload extends SocketBasePayload {
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
  id_mqtt_mensagem: number | null;
  topic: string | null;
  shouldTriggerEmergencyStop: boolean;
}

export interface SensorAcoplamentoSocketPayload extends SocketBasePayload {
  id_sensor: number;
  id_tanque: number;
  id_processo_tanque_sensor: number | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  sinal_detectado: boolean;
  status_anterior: StatusAcoplamentoMangueira | null;
  status_acoplamento: StatusAcoplamentoMangueira;
  status_mudou: boolean;
  processo_em_execucao: boolean;
  ultima_verificacao: Date;
  verificado_em?: Date | null;
  topic?: string | null;
  receivedAt?: Date | null;
}
