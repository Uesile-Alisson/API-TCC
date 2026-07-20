import { BadRequestException, Injectable } from '@nestjs/common';
import { tipobomba, tiposensor } from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { CommandOptions } from '../../mqtt-hardware/commands/interfaces/command-options.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import { CommandPayloadBuilder } from '../../mqtt-hardware/commands/command-payload.builder';
import { MQTT_COMMANDS } from '../../mqtt-hardware/commands/interfaces/command-name.interface';
import { MqttHealthService } from '../../mqtt-hardware/connection/mqtt-health.service';
import { MqttCredentialsService } from '../../mqtt-hardware/config/mqtt-credentials.service';
import {
  ESP32_MQTT_SCHEMA_VERSION,
  Esp32ProcessStartPayload,
} from '../../mqtt-hardware/interfaces/esp32-contracts.interface';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttCommandFailure,
  ProcessoMqttHardwareReadiness,
  ProcessoMqttOperationResult,
  ProcessoMqttStartHooks,
} from './processo-mqtt.types';

@Injectable()
export class ProcessoMqttOrchestratorService {
  constructor(
    private readonly commandService: CommandService,
    private readonly mqttHealthService: MqttHealthService,
    private readonly mqttCredentialsService: MqttCredentialsService,
    private readonly prisma: PrismaService,
  ) {}

  getHardwareReadiness(): ProcessoMqttHardwareReadiness {
    const currentStatus = this.mqttHealthService.getCurrentState();
    const credentialState =
      this.mqttCredentialsService.getCredentialReadiness();
    const configurationApplied =
      this.mqttHealthService.isCurrentConfigApplied();
    const mqttOperational =
      credentialState.credenciaisConfiguradas &&
      credentialState.credenciaisVerificadas &&
      currentStatus.mqttConnected &&
      configurationApplied;

    return {
      credentialsConfigured: credentialState.credenciaisConfiguradas,
      credentialsVerified: credentialState.credenciaisVerificadas,
      credentialsVerifiedAt: credentialState.verificadasEm,
      credentialsFailure: credentialState.ultimaFalha,
      mqttConnected: currentStatus.mqttConnected,
      configurationApplied,
      mqttOperational,
      esp32Online: currentStatus.esp32Online,
      communicationReady: mqttOperational && currentStatus.esp32Online,
      currentStatus,
    };
  }

  async prepareHardwareForStart(
    context: ProcessoMqttCommandContext,
    hooks: ProcessoMqttStartHooks = {},
  ): Promise<ProcessoMqttOperationResult> {
    try {
      const readiness = this.getHardwareReadiness();
      const command_results = await this.runSafePreparationCommands(
        context.id_processo,
        hooks,
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

  async startVacuumOperation(
    context: ProcessoMqttCommandContext,
    hooks: ProcessoMqttStartHooks = {},
  ): Promise<ProcessoMqttOperationResult> {
    const commandResults: CommandResult[] = [];
    let rollbackRequired = false;

    try {
      const payload = await this.buildStartPayload(
        context.id_processo,
        hooks.correlationPrefix
          ? `${hooks.correlationPrefix}-load-process`
          : undefined,
      );
      rollbackRequired = true;
      await this.runStartSequence(payload, commandResults, hooks);

      return {
        success: true,
        message:
          'Processo carregado no ESP32, válvulas principais confirmadas e bomba principal ligada.',
        id_processo: context.id_processo,
        command_results: commandResults,
      };
    } catch (error) {
      const failure = this.toFailureResult(context.id_processo, error);

      if (!rollbackRequired) {
        return failure;
      }

      const rollback = await this.shutdownAllActuators(
        context.id_processo,
        hooks.correlationPrefix
          ? `${hooks.correlationPrefix}-rollback`
          : undefined,
      );
      return {
        ...failure,
        message: rollback.success
          ? `${failure.message} Parada segura confirmada após a falha de início.`
          : `${failure.message} Falha adicional ao confirmar parada segura: ${rollback.message}`,
        command_results: [
          ...commandResults,
          ...(rollback.command_results ?? []),
        ],
      };
    }
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
      const preparationResults = await this.runSafePreparationCommands(
        context.id_processo,
      );
      const startResult = await this.startVacuumOperation(context);

      if (!startResult.success) {
        return {
          ...startResult,
          command_results: [
            ...preparationResults,
            ...(startResult.command_results ?? []),
          ],
        };
      }

      return {
        success: true,
        message: 'Operação retomada com sequência física confirmada por ACK.',
        id_processo: context.id_processo,
        command_results: [
          ...preparationResults,
          ...(startResult.command_results ?? []),
        ],
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

  async shutdownAllActuators(
    id_processo: number,
    correlationPrefix?: string,
  ): Promise<ProcessoMqttOperationResult> {
    const { command_results, command_failures } =
      await this.runShutdownCommands(id_processo, correlationPrefix);

    if (command_failures.length === 0) {
      return {
        success: true,
        message: 'Atuadores desligados com segurança.',
        id_processo,
        command_results,
      };
    }

    return {
      success: false,
      message: this.buildShutdownFailureMessage(command_failures),
      id_processo,
      command_results,
      command_failures,
    };
  }

  private async buildStartPayload(
    id_processo: number,
    correlationId?: string,
  ): Promise<Esp32ProcessStartPayload> {
    const [processo, sistema, bomba] = await Promise.all([
      this.prisma.processos.findUnique({
        where: { id_processo },
        include: {
          processostanques: {
            include: {
              tanques: {
                include: {
                  valvulas: {
                    where: { ativo: true },
                    include: {
                      bombas: true,
                    },
                    orderBy: [{ id_bomba: 'asc' }, { id_valvula: 'asc' }],
                  },
                  sensoresacoplamentomangueiras: {
                    include: { sensores: true },
                  },
                },
              },
              processostanquessensores: {
                include: { sensores: true },
                orderBy: { id_processo_tanque_sensor: 'asc' },
              },
            },
            orderBy: { id_processo_tanque: 'asc' },
          },
        },
      }),
      this.prisma.configuracoessistema.findFirst({
        orderBy: { id_configuracao_sistema: 'asc' },
      }),
      this.prisma.bombas.findFirst({
        where: { tipo_bomba: tipobomba.PRINCIPAL },
        orderBy: { id_bomba: 'asc' },
      }),
    ]);

    if (!processo) {
      throw new BadRequestException(
        `Processo ${id_processo} nao encontrado para comando MQTT.`,
      );
    }

    if (!sistema) {
      throw new BadRequestException(
        'Configuracao do sistema nao encontrada para comando MQTT.',
      );
    }

    if (!bomba) {
      throw new BadRequestException(
        'Bomba principal nao encontrada para iniciar processo de vacuo.',
      );
    }

    const correlation_id =
      correlationId ??
      CommandPayloadBuilder.build(MQTT_COMMANDS.INICIAR_PROCESSO_VACUO, {})
        .correlation_id;
    const unidade =
      processo.processostanques[0]?.processostanquessensores[0]?.sensores
        .unidade_medida ?? 'kPa';

    return {
      tipo: 'INICIAR_PROCESSO_VACUO',
      schema_version: ESP32_MQTT_SCHEMA_VERSION,
      correlation_id,
      enviado_em: new Date().toISOString(),
      id_processo,
      modo_operacao_auxiliar: processo.modo_operacao_auxiliar,
      tanques: processo.processostanques.map((tanque) => {
        const sensorVacuo = tanque.processostanquessensores.find(
          (sensor) => sensor.sensores.tipo_sensor === tiposensor.VACUO,
        );
        const sensorAcoplamento =
          tanque.tanques.sensoresacoplamentomangueiras?.sensores ?? null;

        if (!sensorVacuo) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} nao possui sensor de vacuo vinculado ao processo.`,
          );
        }

        if (!sensorAcoplamento) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} nao possui sensor de acoplamento vinculado.`,
          );
        }

        if (tanque.tanques.valvulas.length === 0) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} nao possui valvula ativa vinculada.`,
          );
        }

        const mainValves = tanque.tanques.valvulas.filter(
          (valvula) =>
            this.resolveValveType(valvula.bombas.tipo_bomba) === 'PRINCIPAL',
        );
        const auxiliaryValves = tanque.tanques.valvulas.filter(
          (valvula) =>
            this.resolveValveType(valvula.bombas.tipo_bomba) === 'AUXILIAR',
        );

        if (mainValves.length !== 1) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} deve possuir exatamente uma valvula principal ativa vinculada.`,
          );
        }

        if (auxiliaryValves.length !== 1) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} deve possuir exatamente uma valvula auxiliar ativa vinculada.`,
          );
        }

        const processValves = [mainValves[0], auxiliaryValves[0]];

        return {
          id_tanque: tanque.id_tanque,
          codigo_hardware: this.requireCode(
            tanque.tanques.codigo_hardware,
            `tanque ${tanque.tanques.nome}`,
          ),
          id_processo_tanque: tanque.id_processo_tanque,
          id_processo_tanque_sensor: sensorVacuo.id_processo_tanque_sensor,
          sensor_vacuo: {
            id_sensor: sensorVacuo.id_sensor,
            codigo_hardware: this.requireCode(
              sensorVacuo.sensores.codigo_hardware,
              `sensor ${sensorVacuo.sensores.nome}`,
            ),
            nome: sensorVacuo.sensores.nome,
            unidade_medida: sensorVacuo.sensores.unidade_medida,
          },
          sensor_acoplamento: {
            id_sensor: sensorAcoplamento.id_sensor,
            codigo_hardware: this.requireCode(
              sensorAcoplamento.codigo_hardware,
              `sensor ${sensorAcoplamento.nome}`,
            ),
            nome: sensorAcoplamento.nome,
            unidade_medida: sensorAcoplamento.unidade_medida,
          },
          valvulas: processValves.map((valvula) => ({
            id_valvula: valvula.id_valvula,
            codigo_hardware: this.requireCode(
              valvula.codigo_hardware,
              `valvula ${valvula.nome_valvula}`,
            ),
            nome: valvula.nome_valvula,
            funcao_valvula: valvula.funcao_valvula,
            tipo: this.resolveValveType(valvula.bombas.tipo_bomba),
            id_bomba: valvula.id_bomba,
            bomba_codigo_hardware: this.requireCode(
              valvula.bombas.codigo_hardware,
              `bomba ${valvula.bombas.nome}`,
            ),
            numero_saida_manifold: valvula.numero_saida_manifold,
          })),
          vacuo_alvo: Number(tanque.vacuo_alvo),
          unidade: sensorVacuo.sensores.unidade_medida,
        };
      }),
      bomba: {
        id_bomba: bomba.id_bomba,
        codigo_hardware: this.requireCode(
          bomba.codigo_hardware,
          `bomba ${bomba.nome}`,
        ),
        nome: bomba.nome,
        tipo_bomba: bomba.tipo_bomba,
      },
      vacuo_alvo: Number(processo.vacuo_alvo),
      limite_seguranca_vacuo: Number(sistema.limite_seguranca_vacuo),
      tolerancia_vacuo_percentual: Number(sistema.tolerancia_vacuo_percentual),
      unidade,
      seguranca: {
        parar_se_desacoplar: true,
        parada_emergencia_habilitada: true,
      },
    };
  }

  private async runSafePreparationCommands(
    id_processo: number,
    hooks: ProcessoMqttStartHooks = {},
  ): Promise<CommandResult[]> {
    const shutdown = await this.runShutdownCommands(
      id_processo,
      hooks.correlationPrefix
        ? `${hooks.correlationPrefix}-prepare`
        : undefined,
    );

    if (shutdown.command_failures.length > 0) {
      throw new Error(
        this.buildShutdownFailureMessage(shutdown.command_failures),
      );
    }

    await hooks.onStage?.('SINCRONIZANDO_HARDWARE');
    const syncResult = await this.commandService.sincronizarHardware(
      this.buildCommandOptions(
        id_processo,
        'Sincronizar hardware do processo.',
        hooks.correlationPrefix
          ? `${hooks.correlationPrefix}-sync-config`
          : undefined,
      ),
    );

    return [...shutdown.command_results, syncResult];
  }

  private async runStartSequence(
    payload: Esp32ProcessStartPayload,
    results: CommandResult[],
    hooks: ProcessoMqttStartHooks = {},
  ): Promise<void> {
    await hooks.onStage?.('CARREGANDO_PROCESSO');
    const loadResult = await this.commandService.iniciarProcessoVacuo(payload, {
      id_processo: payload.id_processo,
    });
    results.push(loadResult);

    await hooks.onStage?.('ABRINDO_VALVULAS_PRINCIPAIS');
    for (const tanque of payload.tanques) {
      const mainValve = tanque.valvulas.find(
        (valvula) => valvula.tipo === 'PRINCIPAL',
      );

      if (!mainValve) {
        throw new BadRequestException(
          `Tanque ${tanque.id_tanque} sem válvula principal para sequência de início.`,
        );
      }

      const valveResult = await this.commandService.abrirValvula(
        this.buildCommandOptions(
          payload.id_processo,
          `Abrir ${mainValve.codigo_hardware} do tanque ${tanque.codigo_hardware}.`,
          hooks.correlationPrefix
            ? `${hooks.correlationPrefix}-open-main-valve-${mainValve.id_valvula}`
            : undefined,
        ),
        mainValve.id_valvula,
        mainValve.codigo_hardware,
        {
          id_tanque: tanque.id_tanque,
          id_processo_tanque: tanque.id_processo_tanque,
        },
      );
      results.push(valveResult);
    }

    await hooks.onStage?.('LIGANDO_BOMBA_PRINCIPAL');
    const pumpResult = await this.commandService.ligarBomba(
      this.buildCommandOptions(
        payload.id_processo,
        'Ligar bomba principal após confirmar válvulas principais abertas.',
      ),
      payload.bomba.id_bomba,
      payload.bomba.codigo_hardware,
    );
    results.push(pumpResult);
  }

  private async runShutdownCommands(
    id_processo: number,
    correlationPrefix?: string,
  ): Promise<{
    command_results: CommandResult[];
    command_failures: ProcessoMqttCommandFailure[];
  }> {
    const options = this.buildCommandOptions(
      id_processo,
      'Colocar hardware do processo em estado seguro.',
    );
    const command_results: CommandResult[] = [];
    const command_failures: ProcessoMqttCommandFailure[] = [];
    const commands = [
      {
        comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
        execute: () =>
          this.commandService.desligarTodasBombas({
            ...options,
            ...(correlationPrefix
              ? { correlation_id: `${correlationPrefix}-stop-all-pumps` }
              : {}),
          }),
      },
      {
        comando: MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
        execute: () =>
          this.commandService.fecharTodasValvulas({
            ...options,
            ...(correlationPrefix
              ? { correlation_id: `${correlationPrefix}-close-all-valves` }
              : {}),
          }),
      },
    ] as const;

    for (const command of commands) {
      try {
        command_results.push(await command.execute());
      } catch (error) {
        command_failures.push({
          comando: command.comando,
          message: this.toErrorMessage(error),
        });
      }
    }

    return { command_results, command_failures };
  }

  private buildShutdownFailureMessage(
    failures: ProcessoMqttCommandFailure[],
  ): string {
    return `Falha ao confirmar todos os comandos de parada segura: ${failures
      .map((failure) => `${failure.comando}: ${failure.message}`)
      .join('; ')}`;
  }

  private buildCommandOptions(
    id_processo: number,
    motivo: string,
    correlationId?: string,
  ): CommandOptions {
    return {
      id_processo,
      motivo: `Processo ${id_processo}: ${motivo}`,
      ...(correlationId ? { correlation_id: correlationId } : {}),
    };
  }

  private toFailureResult(
    id_processo: number,
    error: unknown,
  ): ProcessoMqttOperationResult {
    return {
      success: false,
      message: this.toErrorMessage(error),
      id_processo,
    };
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Falha ao executar comando MQTT do processo.';
  }

  private requireCode(value: string | null, label: string): string {
    const code = value?.trim();

    if (!code) {
      throw new BadRequestException(
        `codigo_hardware ausente para ${label}. Comando MQTT bloqueado.`,
      );
    }

    return code;
  }

  private resolveValveType(
    tipoBomba: string,
  ): 'PRINCIPAL' | 'AUXILIAR' | 'OUTRA' {
    if (tipoBomba === 'PRINCIPAL') {
      return 'PRINCIPAL';
    }

    if (tipoBomba === 'AUXILIAR') {
      return 'AUXILIAR';
    }

    return 'OUTRA';
  }
}
