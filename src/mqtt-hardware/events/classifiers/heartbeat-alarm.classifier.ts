import { Injectable } from '@nestjs/common';
import { origemalarme, severidadealarme, tipoalarme } from '@prisma/client';
import type {
  AlarmClassificationResult,
  HeartbeatEventInput,
  HeartbeatTimeoutInput,
} from '../interfaces';

@Injectable()
export class HeartbeatAlarmClassifier {
  classifyHeartbeatReceived(
    input: HeartbeatEventInput,
  ): AlarmClassificationResult {
    if (input.esp32_online) {
      return {
        shouldCreateAlarm: false,
        reason: 'Heartbeat recebido com ESP32 online.',
        shouldTriggerEmergencyStop: false,
      };
    }

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.ESP32,
      severidade: severidadealarme.MEDIO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Timeout de heartbeat do ESP32 durante processo',
      descricao:
        'O sistema recebeu heartbeat com indicação de ESP32 offline. A comunicação com o hardware deve ser verificada.',
      id_mqtt_mensagem: null,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: 'ms',
      shouldTriggerEmergencyStop: false,
    };
  }

  classifyHeartbeatTimeout(
    input: HeartbeatTimeoutInput,
  ): AlarmClassificationResult {
    if (input.processo_em_execucao) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.ESP32,
        severidade: severidadealarme.CRITICO,
        origem_alarme: origemalarme.SISTEMA,
        titulo: 'Timeout de heartbeat do ESP32 durante processo',
        descricao: this.buildTimeoutDescription(input),
        id_mqtt_mensagem: null,
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque ?? null,
        id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
        id_usuario_responsavel: null,
        valor_detectado: input.timeoutMs,
        unidade: 'ms',
        shouldTriggerEmergencyStop: true,
      };
    }

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.ESP32,
      severidade: severidadealarme.MEDIO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Timeout de heartbeat do ESP32 durante processo',
      descricao: this.buildTimeoutDescription(input),
      id_mqtt_mensagem: null,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
      id_usuario_responsavel: null,
      valor_detectado: input.timeoutMs,
      unidade: 'ms',
      shouldTriggerEmergencyStop: false,
    };
  }

  private buildTimeoutDescription(input: HeartbeatTimeoutInput): string {
    const lastHeartbeatDescription = input.lastHeartbeatAt
      ? `Último heartbeat recebido em ${input.lastHeartbeatAt.toISOString()}.`
      : 'Nenhum hearbeat anterior foi encontrado.';

    const processDescription = input.processo_em_execucao
      ? 'A falha ocorreu durante processo em execução.'
      : 'A falha ocorreu fora de processo em execução.';

    return `${lastHeartbeatDescription} O ESP32 não enviou heartbeat dentro do limite configurado de ${input.timeoutMs?.toNumber()} ms.${processDescription}`;
  }
}
