import { Injectable } from '@nestjs/common';
import { origemalarme, tipoalarme } from '@prisma/client';
import type { AlarmeDetailsRecord } from '../repositories';

export interface AlarmNormalizationResult {
  normalized: boolean;
  reason: string;
}

@Injectable()
export class AlarmNormalizationService {
  validateMqttAlarm(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateEsp32Alarm(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateSensorAlarm(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateAcoplamentoAlarm(
    alarme: AlarmeDetailsRecord,
  ): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateVacuoAlarm(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateBombaValvulaAlarm(
    alarme: AlarmeDetailsRecord,
  ): AlarmNormalizationResult {
    return this.validateGenericAlarm(alarme);
  }

  validateGenericAlarm(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    if (alarme.normalizado_em) {
      return {
        normalized: true,
        reason: 'Alarme ja possui normalizacao tecnica registrada.',
      };
    }

    return {
      normalized: false,
      reason: this.describeMissingEvidence(alarme),
    };
  }

  validate(alarme: AlarmeDetailsRecord): AlarmNormalizationResult {
    if (alarme.tipo_alarme === tipoalarme.MQTT) {
      return this.validateMqttAlarm(alarme);
    }

    if (alarme.tipo_alarme === tipoalarme.ESP32) {
      return this.validateEsp32Alarm(alarme);
    }

    if (alarme.tipo_alarme === tipoalarme.SENSOR) {
      return this.validateSensorAlarm(alarme);
    }

    if (alarme.tipo_alarme === tipoalarme.BOMBA) {
      return this.validateBombaValvulaAlarm(alarme);
    }

    if (alarme.origem_alarme === origemalarme.SENSOR) {
      return this.validateVacuoAlarm(alarme);
    }

    return this.validateGenericAlarm(alarme);
  }

  private describeMissingEvidence(alarme: AlarmeDetailsRecord): string {
    if (alarme.tipo_alarme === tipoalarme.MQTT) {
      return 'MQTT ainda nao possui evidencia tecnica de conexao estavel.';
    }

    if (alarme.tipo_alarme === tipoalarme.ESP32) {
      return 'ESP32 ainda nao possui heartbeat recente confirmado.';
    }

    if (alarme.tipo_alarme === tipoalarme.SENSOR) {
      return 'Sensor ainda nao possui leitura valida recente.';
    }

    return 'A causa tecnica ainda nao foi normalizada pelo sistema.';
  }
}
