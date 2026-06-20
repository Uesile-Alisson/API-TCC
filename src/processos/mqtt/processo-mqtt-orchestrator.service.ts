import { Injectable } from '@nestjs/common';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { CommandOptions } from '../../mqtt-hardware/commands/interfaces/command-options.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import { MqttHealthService } from '../../mqtt-hardware/connection/mqtt-health.service';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttHardwareReadiness,
  ProcessoMqttOperationResult,
} from './processo-mqtt.types';

@Injectable()
export class ProcessoMqttOrchestratorService {
  constructor(
    private readonly commandService: CommandService,
    private readonly mqttHealthService: MqttHealthService,
  ) {}

  getHardwareReadiness(): ProcessoMqttHardwareReadiness {
    const currentStatus = this.mqttHealthService.getCurrentState();

    return {
      mqttConnected: currentStatus.mqttConnected,
      esp32Online: currentStatus.esp32Online,
      communicationReady:
        currentStatus.mqttConnected && currentStatus.esp32Online,
      currentStatus,
    };
  }

  async prepareHardwareForStart(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    try {
      const readiness = this.getHardwareReadiness();
      const command_results = await this.runSafePreparationCommands(
        context.id_processo,
      );

      return {
        success: true,
        message: readiness.communicationReady
          ? 'Hardware preparado com sucesso.'
          : 'Hardware preparado, mas comunicação ainda não está pronta.',
        id_processo: context.id_processo,
        command_results,
      };
    } catch (error) {
      return this.toFailureResult(context.id_processo, error);
    }
  }

  startVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    return Promise.resolve({
      success: true,
      message:
        'Orquestrador pronto para iniciar vácuo; mapeamento de bomba será informado pelo contexto operacional futuro.',
      id_processo: context.id_processo,
      command_results: [],
    });
  }

  async pauseVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    return this.shutdownAllActuators(context.id_processo);
  }

  async resumeVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    try {
      const command_results = await this.runSafePreparationCommands(
        context.id_processo,
      );

      return {
        success: true,
        message:
          'Operação pronta para retomada; mapeamento de bomba será informado pelo contexto operacional futuro.',
        id_processo: context.id_processo,
        command_results,
      };
    } catch (error) {
      return this.toFailureResult(context.id_processo, error);
    }
  }

  async finishVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    return this.shutdownAllActuators(context.id_processo);
  }

  async interruptVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    return this.shutdownAllActuators(context.id_processo);
  }

  async executeEmergencyStop(input: {
    id_processo: number;
    motivo?: string | null;
  }): Promise<ProcessoMqttOperationResult> {
    try {
      const commandResult = await this.commandService.paradaEmergencia(
        this.buildCommandOptions(
          input.id_processo,
          input.motivo ?? 'Parada de emergência do processo.',
        ),
      );

      return {
        success: true,
        message: 'Parada de emergência executada.',
        id_processo: input.id_processo,
        command_results: [commandResult],
      };
    } catch (error) {
      return this.toFailureResult(input.id_processo, error);
    }
  }

  async shutdownAllActuators(
    id_processo: number,
  ): Promise<ProcessoMqttOperationResult> {
    try {
      const command_results = await this.runShutdownCommands(id_processo);

      return {
        success: true,
        message: 'Atuadores desligados com segurança.',
        id_processo,
        command_results,
      };
    } catch (error) {
      return this.toFailureResult(id_processo, error);
    }
  }

  private async runSafePreparationCommands(
    id_processo: number,
  ): Promise<CommandResult[]> {
    const results = await this.runShutdownCommands(id_processo);
    const syncResult = await this.commandService.sincronizarHardware(
      this.buildCommandOptions(
        id_processo,
        'Sincronizar hardware do processo.',
      ),
    );

    return [...results, syncResult];
  }

  private async runShutdownCommands(
    id_processo: number,
  ): Promise<CommandResult[]> {
    const options = this.buildCommandOptions(
      id_processo,
      'Colocar hardware do processo em estado seguro.',
    );

    const desligarBombasResult =
      await this.commandService.desligarTodasBombas(options);
    const fecharValvulasResult =
      await this.commandService.fecharTodasValvulas(options);

    return [desligarBombasResult, fecharValvulasResult];
  }

  private buildCommandOptions(
    id_processo: number,
    motivo: string,
  ): CommandOptions {
    return {
      motivo: `Processo ${id_processo}: ${motivo}`,
    };
  }

  private toFailureResult(
    id_processo: number,
    error: unknown,
  ): ProcessoMqttOperationResult {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao executar comando MQTT do processo.',
      id_processo,
    };
  }
}
