import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StatusAcoplamentoMangueira,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statustanque,
} from '@prisma/client';
import {
  ProcessoOperationalContext,
  ProcessoSensorOperationalContext,
  ProcessoTanqueOperationalContext,
} from '../interfaces';

@Injectable()
export class ProcessoSafetyValidator {
  validateSafeToStart(context: ProcessoOperationalContext): void {
    const reasons = this.getStartBlockingReasons(context);

    if (reasons.length > 0) {
      throw new BadRequestException({
        message: 'Processo bloqueado por regras de segurança operacional.',
        reasons,
      });
    }
  }

  validateSafeToResume(context: ProcessoOperationalContext): void {
    const reasons = this.getStartBlockingReasons(context);

    if (context.status_processo !== statusprocesso.PAUSADO) {
      reasons.unshift('Somente processos pausados podem ser retomados.');
    }

    if (reasons.length > 0) {
      throw new BadRequestException({
        message: 'Retomada bloqueada por regras de segurança operacional.',
        reasons,
      });
    }
  }

  getStartBlockingReasons(context: ProcessoOperationalContext): string[] {
    const reasons: string[] = [];

    this.validateHardware(context, reasons);
    this.validateCriticalAlarms(context, reasons);
    this.validateTanques(context, reasons);
    this.validateSensores(context, reasons);
    this.validateAcoplamentos(context, reasons);

    if (context.parada_emergencia) {
      reasons.push(
        'O processo possui parada de emergência registrada e não pode ser iniciado sem intervenção.',
      );
    }

    return reasons;
  }

  private validateHardware(
    context: ProcessoOperationalContext,
    reasons: string[],
  ): void {
    const hardware = context.safety?.hardware;

    if (!hardware) {
      reasons.push('Contexto de hardware não foi carregado.');
      return;
    }

    if (!hardware.mqtt_connected) {
      reasons.push('MQTT desconectado.');
    }

    if (!hardware.esp32_online) {
      reasons.push('ESP32 offline.');
    }

    if (!hardware.communication_ready) {
      reasons.push('Comunicação com o hardware não está pronta.');
    }

    if (
      hardware.esp32_status === statusgeralsistema.FALHA ||
      hardware.esp32_status === statusgeralsistema.BLOQUEADO
    ) {
      reasons.push(
        `Status geral do ESP32/sistema bloqueante: ${hardware.esp32_status}.`,
      );
    }
  }

  private validateCriticalAlarms(
    context: ProcessoOperationalContext,
    reasons: string[],
  ): void {
    if (context.safety?.has_critical_alarm) {
      reasons.push('Existe alarme crítico ativo no sistema/processo.');
    }

    const criticalAlarms = context.safety?.critical_alarms ?? [];

    for (const alarm of criticalAlarms) {
      reasons.push(`Alarme crítico ativo: ${alarm.titulo}.`);
    }
  }

  private validateTanques(
    context: ProcessoOperationalContext,
    reasons: string[],
  ): void {
    if (!context.tanques || context.tanques.length === 0) {
      reasons.push('Processo não possui tanques associados.');
      return;
    }

    for (const tanque of context.tanques) {
      this.validateTanque(tanque, reasons);
    }
  }

  private validateTanque(
    tanque: ProcessoTanqueOperationalContext,
    reasons: string[],
  ): void {
    if (tanque.status_tanque === statustanque.INATIVO) {
      reasons.push(`Tanque ${tanque.nome_tanque} está inativo.`);
    }

    if (tanque.status_tanque === statustanque.MANUTENCAO) {
      reasons.push(`Tanque ${tanque.nome_tanque} está em manutenção.`);
    }

    if (tanque.status_tanque === statustanque.FALHA) {
      reasons.push(`Tanque ${tanque.nome_tanque} está em falha.`);
    }

    if (!tanque.sensores || tanque.sensores.length === 0) {
      reasons.push(
        `Tanque ${tanque.nome_tanque} não possui sensores associados.`,
      );
    }
  }

  private validateSensores(
    context: ProcessoOperationalContext,
    reasons: string[],
  ): void {
    for (const tanque of context.tanques ?? []) {
      for (const sensor of tanque.sensores ?? []) {
        this.validateSensor(sensor, tanque, reasons);
      }
    }
  }

  private validateSensor(
    sensor: ProcessoSensorOperationalContext,
    tanque: ProcessoTanqueOperationalContext,
    reasons: string[],
  ): void {
    if (!sensor.ativo_no_processo) {
      reasons.push(
        `Sensor ${sensor.nome_sensor} do tanque ${tanque.nome_tanque} não está ativo no processo.`,
      );
    }

    if (sensor.status_sensor === statussensor.INATIVO) {
      reasons.push(
        `Sensor ${sensor.nome_sensor} do tanque ${tanque.nome_tanque} está inativo.`,
      );
    }

    if (sensor.status_sensor === statussensor.FALHA) {
      reasons.push(
        `Sensor ${sensor.nome_sensor} do tanque ${tanque.nome_tanque} está em falha.`,
      );
    }

    if (sensor.status_sensor === statussensor.DESCONECTADO) {
      reasons.push(
        `Sensor ${sensor.nome_sensor} do tanque ${tanque.nome_tanque} está desconectado.`,
      );
    }
  }

  private validateAcoplamentos(
    context: ProcessoOperationalContext,
    reasons: string[],
  ): void {
    for (const tanque of context.tanques ?? []) {
      for (const sensor of tanque.sensores ?? []) {
        this.validateAcoplamento(sensor, tanque, reasons);
      }
    }
  }

  private validateAcoplamento(
    sensor: ProcessoSensorOperationalContext,
    tanque: ProcessoTanqueOperationalContext,
    reasons: string[],
  ): void {
    const acoplamento = sensor.acoplamento;

    if (!acoplamento) {
      reasons.push(
        `Sensor ${sensor.nome_sensor} do tanque ${tanque.nome_tanque} não possui leitura de acoplamento carregada.`,
      );
      return;
    }

    if (!acoplamento.ativo) {
      reasons.push(
        `Sensor de acoplamento do tanque ${tanque.nome_tanque} está inativo.`,
      );
    }

    if (
      acoplamento.status_acoplamento !== StatusAcoplamentoMangueira.ACOPLADA
    ) {
      reasons.push(
        `Mangueira do tanque ${tanque.nome_tanque} não está acoplada. Status atual: ${acoplamento.status_acoplamento}.`,
      );
    }

    if (!acoplamento.sinal_detectado) {
      reasons.push(
        `Sensor de acoplamento do tanque ${tanque.nome_tanque} não detectou sinal físico de conexão.`,
      );
    }
  }
}
