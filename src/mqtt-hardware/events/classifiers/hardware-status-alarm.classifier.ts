import { Injectable } from '@nestjs/common';
import {
  origemalarme,
  severidadealarme,
  statusbomba,
  statusgeralsistema,
  StatusValvula,
  tipoalarme,
} from '@prisma/client';
import type {
  AlarmClassificationResult,
  HardwareStatusEventInput,
  HardwareValveStatusInput,
} from '../interfaces';

@Injectable()
export class HardwareStatusAlarmClassifier {
  classify(input: HardwareStatusEventInput): AlarmClassificationResult {
    if (!input.esp32_online) {
      return this.classifyEsp32Offline(input);
    }

    if (input.status_geral_sistema === statusgeralsistema.BLOQUEADO) {
      return this.classifyBlockedSystem(input);
    }

    if (input.status_geral_sistema === statusgeralsistema.FALHA) {
      return this.classifySystemFailure(input);
    }

    if (this.hasPumpFailure(input)) {
      return this.classifyPumpFailure(input);
    }

    const failedValve = this.findFailedValve(input.status_valvulas);

    if (failedValve) {
      return this.classifyValveFailure(input, failedValve);
    }

    if (input.status_geral_sistema === statusgeralsistema.ALERTA) {
      return this.classifySystemAlert(input);
    }

    return {
      shouldCreateAlarm: false,
      reason: 'Status do hardware dentro da condição operacional.',
      shouldTriggerEmergencyStop: false,
    };
  }

  private classifyEsp32Offline(
    input: HardwareStatusEventInput,
  ): AlarmClassificationResult {
    const isCritical = this.isRunningProcess(input);

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.ESP32,
      severidade: isCritical
        ? severidadealarme.CRITICO
        : severidadealarme.MEDIO,
      origem_alarme: origemalarme.SISTEMA,
      titulo: 'ESP32 offline',
      descricao: isCritical
        ? 'O ESP32 ficou offline durante processo em execução. A comunicação com o hardware foi perdida.'
        : 'O ESP32 está offline fora de processo em execução.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: isCritical ? (input.id_processo ?? null) : null,
      id_processo_tanque: isCritical
        ? (input.id_processo_tanque ?? null)
        : null,
      id_processo_tanque_sensor: isCritical
        ? (input.id_processo_tanque_sensor ?? null)
        : null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: isCritical,
    };
  }

  private classifyBlockedSystem(
    input: HardwareStatusEventInput,
  ): AlarmClassificationResult {
    const isCritical = this.isRunningProcess(input);

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SISTEMA,
      severidade: isCritical
        ? severidadealarme.CRITICO
        : severidadealarme.MEDIO,
      origem_alarme: origemalarme.ESP32,
      titulo: 'Sistema bloqueado',
      descricao:
        input.mensagem ??
        'O sistema entrou em estado bloqueado por condição operacional insegura.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: input.id_processo ?? null,
      id_processo_tanque: input.id_processo_tanque ?? null,
      id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: isCritical,
    };
  }

  private classifySystemFailure(
    input: HardwareStatusEventInput,
  ): AlarmClassificationResult {
    const isCritical = this.isRunningProcess(input);

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SISTEMA,
      severidade: isCritical
        ? severidadealarme.CRITICO
        : severidadealarme.MEDIO,
      origem_alarme: origemalarme.ESP32,
      titulo: 'Falha falha geral em hardware',
      descricao:
        input.erro ??
        input.mensagem ??
        'O ESP32 informou falha geral no hardware.',
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: isCritical ? (input.id_processo ?? null) : null,
      id_processo_tanque: isCritical
        ? (input.id_processo_tanque ?? null)
        : null,
      id_processo_tanque_sensor: isCritical
        ? (input.id_processo_tanque_sensor ?? null)
        : null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: isCritical,
    };
  }

  private classifyPumpFailure(
    input: HardwareStatusEventInput,
  ): AlarmClassificationResult {
    const isCritical = this.isRunningProcess(input);
    const bombaComFalha = this.getFailedPumpLabel(input);

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SISTEMA,
      severidade: isCritical
        ? severidadealarme.CRITICO
        : severidadealarme.MEDIO,
      origem_alarme: origemalarme.ESP32,
      titulo: 'Falha em bomba',
      descricao: isCritical
        ? `O hardware informou falha em ${bombaComFalha} durante processo em execução.`
        : `O hardware informou falha em ${bombaComFalha} fora de processo em execução.`,
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: isCritical ? (input.id_processo ?? null) : null,
      id_processo_tanque: isCritical
        ? (input.id_processo_tanque ?? null)
        : null,
      id_processo_tanque_sensor: isCritical
        ? (input.id_processo_tanque_sensor ?? null)
        : null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: isCritical,
    };
  }

  private classifyValveFailure(
    input: HardwareStatusEventInput,
    valve: HardwareValveStatusInput,
  ): AlarmClassificationResult {
    const isCritical = this.isRunningProcess(input);
    const valveDescription = this.buildValveDescription(valve);

    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SISTEMA,
      severidade: isCritical
        ? severidadealarme.CRITICO
        : severidadealarme.MEDIO,
      origem_alarme: origemalarme.ESP32,
      titulo: 'Falha em válvula',
      descricao: isCritical
        ? `O hardware informou falha em ${valveDescription} durante processo em execução.`
        : `O hardware informou falha em ${valveDescription} fora de processo em execução.`,
      id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
      id_processo: isCritical ? (input.id_processo ?? null) : null,
      id_processo_tanque: isCritical
        ? (input.id_processo_tanque ?? null)
        : null,
      id_processo_tanque_sensor: isCritical
        ? (input.id_processo_tanque_sensor ?? null)
        : null,
      id_usuario_responsavel: null,
      valor_detectado: null,
      unidade: null,
      shouldTriggerEmergencyStop: isCritical,
    };
  }

  private classifySystemAlert(
    input: HardwareStatusEventInput,
  ): AlarmClassificationResult {
    return {
      shouldCreateAlarm: true,
      tipo_alarme: tipoalarme.SISTEMA,
      severidade: severidadealarme.MEDIO,
      origem_alarme: origemalarme.ESP32,
      titulo: 'Alerta operacional do hardware',
      descricao:
        input.mensagem ??
        'O ESP32 informou status de alerta operacional no hardware.',
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

  private isRunningProcess(input: HardwareStatusEventInput): boolean {
    return input.processo_em_execucao === true;
  }

  private hasPumpFailure(input: HardwareStatusEventInput): boolean {
    return (
      input.status_bomba_principal === statusbomba.FALHA ||
      input.status_bomba_auxiliar === statusbomba.FALHA
    );
  }

  private getFailedPumpLabel(input: HardwareStatusEventInput): string {
    const principalFailed = input.status_bomba_principal === statusbomba.FALHA;
    const auxiliarFailed = input.status_bomba_auxiliar === statusbomba.FALHA;

    if (principalFailed && auxiliarFailed) {
      return 'Bomba principal e bomba auxilar';
    }

    if (principalFailed) {
      return 'Bomba principal';
    }

    return 'Bomba auxiliar';
  }

  private findFailedValve(
    valves?: HardwareValveStatusInput[],
  ): HardwareValveStatusInput | null {
    return (
      valves?.find((valve) => valve.status_valvula === StatusValvula.FALHA) ??
      null
    );
  }

  private buildValveDescription(valve: HardwareValveStatusInput): string {
    if (valve.nome_valvula) {
      return `válvula: ${valve.nome_valvula}`;
    }

    if (valve.numero_saida_manifold) {
      return `válvula da saída: ${valve.numero_saida_manifold}`;
    }

    if (valve.id_valvula) {
      return `válvula ID: ${valve.id_valvula}`;
    }

    return 'Uma válvula do sistema';
  }
}
