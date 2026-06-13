import { origemalarme, severidadealarme, tipoalarme } from '@prisma/client';

export type AlarmClassificationResult =
  | AlarmRequiredClassificationResult
  | AlarmIgnoredClassificationResult;

export interface AlarmRequiredClassificationResult {
  shouldCreateAlarm: true;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  origem_alarme: origemalarme;
  titulo: string;
  descricao: string;
  id_mqtt_mensagem?: number | null;
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
  id_usuario_responsavel?: number | null;
  valor_detectado?: number | null;
  unidade?: string | null;
  shouldTriggerEmergencyStop: boolean;
}
export interface AlarmIgnoredClassificationResult {
  shouldCreateAlarm: false;
  reason: string;
  shouldTriggerEmergencyStop: false;
}
