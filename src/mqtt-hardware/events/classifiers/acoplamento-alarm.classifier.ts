import { Injectable } from '@nestjs/common';
import {
  origemalarme,
  severidadealarme,
  StatusAcoplamentoMangueira,
  tipoalarme,
} from '@prisma/client';

import {
  AcoplamentoEventInput,
  AcoplamentoOperationalContext,
  AlarmClassificationResult,
} from '../interfaces';

@Injectable()
export class AcoplamentoAlarmClassifier {
  classify(params: {
    input: AcoplamentoEventInput;
    context: AcoplamentoOperationalContext;
  }): AlarmClassificationResult {
    const { input, context } = params;

    if (!input.status_mudou) {
      return {
        shouldCreateAlarm: false,
        reason: 'Status de acoplamento não mudou.',
        shouldTriggerEmergencyStop: false,
      };
    }

    if (input.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA) {
      return this.classifyAcoplada(input, context);
    }

    if (input.status_acoplamento === StatusAcoplamentoMangueira.DESACOPLADA) {
      return this.classifyDesacoplada(input, context);
    }

    if (
      input.status_acoplamento === StatusAcoplamentoMangueira.FALHA ||
      input.status_acoplamento === StatusAcoplamentoMangueira.DESCONHECIDA
    ) {
      return this.classifyIndisponivel(input, context);
    }

    return {
      shouldCreateAlarm: false,
      reason: 'Status de acoplamento não reconhecido pára classificação.',
      shouldTriggerEmergencyStop: false,
    };
  }

  private classifyAcoplada(
    input: AcoplamentoEventInput,
    context: AcoplamentoOperationalContext,
  ): AlarmClassificationResult {
    const statusAnteriorCritico =
      input.status_anterior === StatusAcoplamentoMangueira.DESACOPLADA ||
      input.status_anterior === StatusAcoplamentoMangueira.FALHA ||
      input.status_anterior === StatusAcoplamentoMangueira.DESCONHECIDA;

    if (!statusAnteriorCritico) {
      return {
        shouldCreateAlarm: false,
        reason: 'Mangueira acoplada sem condição anterior insegura.',
        shouldTriggerEmergencyStop: false,
      };
    }

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SEGURANCA,
      severidade: severidadealarme.INFO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Mangueira acoplada novamente',
      descricao:
        'O sistema detectou que a mangueira voltou para o estado acoplado após uma condição anterior insegura.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: context.processo_em_execucao ? context.id_processo : null,
      id_processo_tanque: context.processo_em_execucao
        ? context.id_processo_tanque
        : null,
      id_processo_tanque_sensor: context.processo_em_execucao
        ? context.id_processo_tanque_sensor
        : null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: false,
    };
  }

  private classifyDesacoplada(
    input: AcoplamentoEventInput,
    context: AcoplamentoOperationalContext,
  ): AlarmClassificationResult {
    if (context.processo_em_execucao) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.SEGURANCA,
        severidade: severidadealarme.CRITICO,
        origem_alarme: origemalarme.SISTEMA,
        titulo: 'Mangueira desacoplada durante processo',
        descricao:
          'O sistema detectou desacoplamento da mangueira enquanto havia processo em execução. Esta condição exige parada de emergência.',
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_processo: null,
        id_processo_tanque: null,
        id_processo_tanque_sensor: context.id_processo_tanque_sensor,
        id_usuario_responsavel: null,
        valor_detectado: null,
        unidade: null,
        shouldTriggerEmergencyStop: true,
      };
    }

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SEGURANCA,
      severidade: severidadealarme.MEDIO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Mangueira desacoplada',
      descricao:
        'O sistema detectou mangueira desacoplada fora de processo. Esta condição impede o início seguro da operação.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: false,
    };
  }

  private classifyIndisponivel(
    input: AcoplamentoEventInput,
    context: AcoplamentoOperationalContext,
  ): AlarmClassificationResult {
    const status =
      input.status_acoplamento === StatusAcoplamentoMangueira.FALHA
        ? 'falha'
        : 'desconhecido';

    if (context.processo_em_execucao) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.SEGURANCA,
        severidade: severidadealarme.CRITICO,
        origem_alarme: origemalarme.SISTEMA,
        titulo: 'Falha no monitoramento de acoplamento durante processo',
        descricao: `O sistema detectou status de acoplamento ${status} durante processo em execução. Como o sensor de segurança perdeu confiabilidade, a operação deve ser interrompida.`,
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_processo: null,
        id_processo_tanque: null,
        id_processo_tanque_sensor: context.id_processo_tanque_sensor,
        id_usuario_responsavel: null,
        valor_detectado: null,
        unidade: null,
        shouldTriggerEmergencyStop: true,
      };
    }

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SEGURANCA,
      severidade: severidadealarme.MEDIO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Falha no monitoramento de acoplamento',
      descricao: `O sistema detectou status de acoplamento ${status} fora de processo. Esta condição deve ser corrigida antes da operação.`,
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: false,
    };
  }
}
