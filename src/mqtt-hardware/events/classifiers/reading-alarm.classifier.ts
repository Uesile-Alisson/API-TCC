import { Injectable } from '@nestjs/common';
import {
  origemalarme,
  severidadealarme,
  statusprocesso,
  statustanqueprocesso,
  tipoalarme,
} from '@prisma/client';

import { ReadingContextCacheService } from '../cache';
import {
  AlarmClassificationResult,
  SensorReadingEventInput,
} from '../interfaces';

@Injectable()
export class ReadingAlarmClassifier {
  constructor(
    private readonly readingContextCache: ReadingContextCacheService,
  ) {}

  async classify(
    input: SensorReadingEventInput,
  ): Promise<AlarmClassificationResult> {
    if (this.hasInvalidReading(input.valor_vacuo)) {
      return this.createInvalidReadingAlarm(input);
    }

    const context = await this.readingContextCache.getContext(
      input.id_processo_tanque_sensor,
    );

    if (!context) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.SENSOR,
        severidade: severidadealarme.CRITICO,
        origem_alarme: origemalarme.SISTEMA,
        titulo: 'Leitura sem vínculo operacional',
        descricao:
          'O sistema recebeu uma leitura de vácuo vinculada a um processo-tanque-sensor inexistente ou inválido.',
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_processo: null,
        id_processo_tanque: null,
        id_processo_tanque_sensor: input.id_processo_tanque_sensor,
        id_usuario_responsavel: null,
        valor_detectado: input.valor_vacuo,
        unidade: null,
        shouldTriggerEmergencyStop: true,
      };
    }

    if (!this.isProcessRunning(context)) {
      return {
        shouldCreateAlarm: false,
        reason: 'Leitura recebida fora de processo em execução.',
        shouldTriggerEmergencyStop: false,
      };
    }

    if (
      this.exceededSafetyLimit(
        input.valor_vacuo,
        context.limite_seguranca_vacuo,
      )
    ) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.SEGURANCA,
        severidade: severidadealarme.CRITICO,
        origem_alarme: origemalarme.SISTEMA,
        titulo: 'Limite de segurança de vácuo excedido',
        descricao:
          'A leitura de vácuo ultrapassou o limite de segurança configurado para o sistema durante processo em execução.',
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_processo: context.id_processo,
        id_processo_tanque: context.id_processo_tanque,
        id_processo_tanque_sensor: context.id_processo_tanque_sensor,
        id_usuario_responsavel: null,
        valor_detectado: input.valor_vacuo,
        unidade: context.unidade_medida,
        shouldTriggerEmergencyStop: true,
      };
    }

    if (
      this.isOutsideTarget(
        input.valor_vacuo,
        context.vacuo_alvo,
        context.tolerancia_vacuo_percentual,
      )
    ) {
      return {
        shouldCreateAlarm: true,
        tipo_alarme: tipoalarme.SENSOR,
        severidade: severidadealarme.MEDIO,
        origem_alarme: origemalarme.SENSOR,
        titulo: 'Vácuo fora do alvo operacional',
        descricao:
          'A leitura de vácuo está fora da faixa aceitável em relação ao vácuo alvo do tanque, mas ainda não ultrapassou o limite de segurança.',
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_processo: context.id_processo,
        id_processo_tanque: context.id_processo_tanque,
        id_processo_tanque_sensor: context.id_processo_tanque_sensor,
        id_usuario_responsavel: null,
        valor_detectado: input.valor_vacuo,
        unidade: context.unidade_medida,
        shouldTriggerEmergencyStop: false,
      };
    }

    return {
      shouldCreateAlarm: false,
      reason: 'Leitura de vácuo dentro da faixa operacional.',
      shouldTriggerEmergencyStop: false,
    };
  }

  private isProcessRunning(context: {
    status_processo: statusprocesso;
    status_tanque_processo: statustanqueprocesso;
  }): boolean {
    return (
      context.status_processo === statusprocesso.EM_EXECUCAO &&
      context.status_tanque_processo === statustanqueprocesso.EM_EXECUCAO
    );
  }

  private hasInvalidReading(value: number): boolean {
    return !Number.isFinite(value);
  }

  private exceededSafetyLimit(
    valorVacuo: number,
    limiteSegurancaVacuo: number,
  ): boolean {
    return Math.abs(valorVacuo) > Math.abs(limiteSegurancaVacuo);
  }

  private isOutsideTarget(
    valorVacuo: number,
    vacuoAlvo: number,
    toleranciaPercentual: number,
  ): boolean {
    const targetAbs = Math.abs(vacuoAlvo);
    const currentAbs = Math.abs(valorVacuo);

    if (targetAbs === 0) {
      return false;
    }

    const minAccepted = targetAbs * (1 - toleranciaPercentual / 100);
    const maxAccepted = targetAbs * (1 + toleranciaPercentual / 100);
    return currentAbs < minAccepted || currentAbs > maxAccepted;
  }

  private createInvalidReadingAlarm(
    input: SensorReadingEventInput,
  ): AlarmClassificationResult {
    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SENSOR,
      severidade: severidadealarme.CRITICO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'Leitura inválida do sensor de vácuo',
      descricao: 'O sistema recebeu uma leitura inválida do sensor de vácuo.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: input.id_processo_tanque_sensor,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: true,
    };
  }
}
