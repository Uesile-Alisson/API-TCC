import { BadRequestException, Injectable } from '@nestjs/common';
import { tipobomba, tiposensor } from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { CommandOptions } from '../../mqtt-hardware/commands/interfaces/command-options.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import { CommandPayloadBuilder } from '../../mqtt-hardware/commands/command-payload.builder';
import { MQTT_COMMANDS } from '../../mqtt-hardware/commands/interfaces/command-name.interface';
import { MqttHealthService } from '../../mqtt-hardware/connection/mqtt-health.service';
import { Esp32ProcessStartPayload } from '../../mqtt-hardware/interfaces/esp32-contracts.interface';
import { PrismaService } from '../../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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

  async startVacuumOperation(
    context: ProcessoMqttCommandContext,
  ): Promise<ProcessoMqttOperationResult> {
    try {
      const payload = await this.buildStartPayload(context.id_processo);
      const commandResult =
        await this.commandService.iniciarProcessoVacuo(payload);

      return {
        success: true,
        message:
          'Orquestrador pronto para iniciar vácuo; mapeamento de bomba será informado pelo contexto operacional futuro.',
        id_processo: context.id_processo,
        command_results: [commandResult],
      };
    } catch (error) {
      return this.toFailureResult(context.id_processo, error);
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

  private async buildStartPayload(
    id_processo: number,
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

    const correlation_id = CommandPayloadBuilder.build(
      MQTT_COMMANDS.INICIAR_PROCESSO_VACUO,
      {},
    ).correlation_id;
    const unidade =
      processo.processostanques[0]?.processostanquessensores[0]?.sensores
        .unidade_medida ?? 'kPa';

    return {
      tipo: 'INICIAR_PROCESSO_VACUO',
      schema_version: 1,
      correlation_id,
      enviado_em: new Date().toISOString(),
      id_processo,
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

        const hasMainValve = tanque.tanques.valvulas.some(
          (valvula) =>
            this.resolveValveType(valvula.bombas.tipo_bomba) === 'PRINCIPAL',
        );

        if (!hasMainValve) {
          throw new BadRequestException(
            `Tanque ${tanque.id_tanque} nao possui valvula principal ativa vinculada.`,
          );
        }

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
          valvulas: tanque.tanques.valvulas.map((valvula) => ({
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
