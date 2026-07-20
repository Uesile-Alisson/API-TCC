import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  etapaencerramentotanque,
  motivoresolucaoalarme,
  Prisma,
  resultadooperacao,
  StatusAcoplamentoMangueira,
  statusalarme,
  statusencerramentotanque,
  statusestagnacao,
  statusprocesso,
  statussensor,
  statustanqueprocesso,
  StatusValvula,
  tipobomba,
  tipoalarme,
  tipoleiturasensor,
  tiposensor,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { CommandOptions } from '../../mqtt-hardware/commands/interfaces/command-options.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoAuxiliarCommandService } from '../auxiliar/processo-auxiliar-command.service';
import { IniciarEncerramentoTanqueDTO } from '../dto';
import {
  CurrentUserPayload,
  ProcessoAuxiliarSafetyAction,
  ProcessoTanqueEncerramentoState,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessosSocketGateway } from '../socket';

const SCHEDULER_NAME = 'processo-encerramento-individual';
const COMMAND_RETRY_DELAY_MS = 5_000;
const MAX_COMMAND_ATTEMPTS = 3;

const CLOSURE_CONTEXT_SELECT =
  Prisma.validator<Prisma.processostanquesSelect>()({
    id_processo_tanque: true,
    id_processo: true,
    id_tanque: true,
    vacuo_alvo: true,
    vacuo_final: true,
    status_tanque_processo: true,
    status_encerramento: true,
    etapa_encerramento: true,
    encerramento_iniciado_em: true,
    isolado_em: true,
    retencao_iniciada_em: true,
    retencao_finalizada_em: true,
    vacuo_isolamento: true,
    perda_vacuo_retencao: true,
    motivo_bloqueio_encerramento: true,
    encerramento_versao: true,
    encerramento_tentativa: true,
    encerramento_comando_tentativas: true,
    encerramento_proxima_tentativa_em: true,
    estabilizacao_leituras_esperadas: true,
    estabilizacao_leituras_observadas: true,
    estabilizacao_cobertura_percentual: true,
    estabilizacao_maior_intervalo_ms: true,
    processos: {
      select: {
        status_processo: true,
        encerramento_automatico: true,
        encerramento_tolerancia_vacuo_percentual: true,
        encerramento_limite_seguranca_vacuo: true,
        encerramento_tempo_estabilizacao_segundos: true,
        encerramento_estabilizacao_cobertura_minima_percentual: true,
        encerramento_timeout_leitura_sensor_ms: true,
        encerramento_tempo_retencao_segundos: true,
        encerramento_perda_vacuo_maxima_retencao: true,
        processosauxiliares: {
          select: {
            status_subsistema: true,
            id_processo_tanque_atual: true,
            versao: true,
          },
        },
        alarmes: {
          where: {
            severidade: 'CRITICO',
            status_alarme: statusalarme.ATIVO,
            resolvido_em: null,
            excluido_em: null,
          },
          select: { id_alarme: true },
          take: 1,
        },
      },
    },
    processostanquesauxiliares: {
      select: { versao: true },
    },
    tanques: {
      select: {
        nome: true,
        sensoresacoplamentomangueiras: {
          select: {
            ativo: true,
            status_acoplamento: true,
            sinal_detectado: true,
            ultima_verificacao: true,
          },
        },
        valvulas: {
          where: { ativo: true },
          orderBy: { id_valvula: 'asc' },
          select: {
            id_valvula: true,
            codigo_hardware: true,
            status_valvula: true,
            bombas: {
              select: {
                id_bomba: true,
                codigo_hardware: true,
                tipo_bomba: true,
                ligada_hardware: true,
                ultimo_status_hardware_em: true,
              },
            },
          },
        },
      },
    },
    processostanquessensores: {
      where: {
        ativo: true,
        removido_em: null,
        sensores: { tipo_sensor: tiposensor.VACUO },
      },
      orderBy: { id_processo_tanque_sensor: 'asc' },
      select: {
        id_processo_tanque_sensor: true,
        id_sensor: true,
        sensores: {
          select: {
            status_sensor: true,
          },
        },
        leiturasensores: {
          where: {
            tipo_leitura: tipoleiturasensor.VACUO,
            valor_vacuo: { not: null },
          },
          orderBy: [{ recebido_em: 'desc' }, { id_leitura_sensor: 'desc' }],
          take: 1,
          select: {
            id_leitura_sensor: true,
            valor_vacuo: true,
            valor: true,
            leitura_em: true,
            recebido_em: true,
          },
        },
      },
    },
  });

type ClosureContext = Prisma.processostanquesGetPayload<{
  select: typeof CLOSURE_CONTEXT_SELECT;
}>;

type ClosureValve = ClosureContext['tanques']['valvulas'][number];

@Injectable()
export class ProcessoTanqueClosureService {
  private readonly logger = new Logger(ProcessoTanqueClosureService.name);
  private readonly processQueues = new Map<number, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandService: CommandService,
    private readonly auxiliaryCommandService: ProcessoAuxiliarCommandService,
    private readonly processoLogService: ProcessoLogService,
    private readonly socketGateway: ProcessosSocketGateway,
  ) {}

  @Cron(CronExpression.EVERY_SECOND, {
    name: SCHEDULER_NAME,
    waitForCompletion: true,
    disabled:
      process.env.NODE_ENV === 'test' ||
      process.env.CLOSURE_SCHEDULER_DISABLED === 'true',
  })
  runScheduledCycle(): Promise<void> {
    return this.runOnce();
  }

  async runOnce(evaluatedAt = new Date()): Promise<void> {
    const processes = await this.prisma.processos.findMany({
      where: {
        status_processo: statusprocesso.EM_EXECUCAO,
        processostanques: {
          some: {
            status_encerramento: {
              in: [
                statusencerramentotanque.PRONTO_PARA_ENCERRAR,
                statusencerramentotanque.ISOLANDO,
                statusencerramentotanque.VERIFICANDO_RETENCAO,
                statusencerramentotanque.BLOQUEADO,
              ],
            },
          },
        },
      },
      orderBy: { id_processo: 'asc' },
      select: { id_processo: true },
    });

    for (const process of processes) {
      await this.enqueueProcess(process.id_processo, () =>
        this.runProcessOnce(process.id_processo, evaluatedAt),
      );
    }
  }

  startManual(input: {
    id_processo: number;
    id_processo_tanque: number;
    dto: IniciarEncerramentoTanqueDTO;
    user: CurrentUserPayload;
  }) {
    return this.enqueueProcess(input.id_processo, async () => {
      const context = await this.findContext(
        input.id_processo,
        input.id_processo_tanque,
      );

      if (!context) {
        throw new NotFoundException('Tanque do processo nao encontrado.');
      }
      if (context.encerramento_versao !== input.dto.expected_version) {
        throw new ConflictException(
          'Versao do encerramento do tanque foi alterada por outra operacao.',
        );
      }
      if (
        context.status_encerramento !==
          statusencerramentotanque.AGUARDANDO_ACAO_MANUAL &&
        context.status_encerramento !==
          statusencerramentotanque.PRONTO_PARA_ENCERRAR
      ) {
        throw new ConflictException(
          'Tanque nao esta aguardando o inicio do encerramento individual.',
        );
      }

      this.assertEligibleForIsolation(context, new Date());
      const claimed = await this.claimIsolation(
        context,
        input.dto.expected_version,
      );
      if (!claimed) {
        throw new ConflictException(
          'Estado do tanque mudou durante a solicitacao de encerramento.',
        );
      }

      await this.safeRegisterLog({
        id_processo: input.id_processo,
        id_usuario: input.user.sub,
        action: 'ENCERRAMENTO_TANQUE_SOLICITADO',
        description:
          `Encerramento manual solicitado para o tanque ${context.id_tanque}. ` +
          `Motivo: ${input.dto.motivo}`,
      });
      const closure = await this.emitClosureUpdate(
        input.id_processo,
        input.id_processo_tanque,
        context.status_encerramento,
        'Encerramento individual aceito; preparando isolamento seguro.',
      );

      return {
        success: true as const,
        message:
          'Encerramento individual aceito e sera executado com confirmacao MQTT.',
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque,
        closure,
      };
    });
  }

  private async runProcessOnce(
    idProcesso: number,
    evaluatedAt: Date,
  ): Promise<void> {
    const active = await this.prisma.processostanques.findMany({
      where: {
        id_processo: idProcesso,
        status_encerramento: {
          in: [
            statusencerramentotanque.ISOLANDO,
            statusencerramentotanque.VERIFICANDO_RETENCAO,
            statusencerramentotanque.BLOQUEADO,
          ],
        },
      },
      orderBy: { id_processo_tanque: 'asc' },
      select: { id_processo_tanque: true },
    });

    for (const tank of active) {
      const context = await this.findContext(
        idProcesso,
        tank.id_processo_tanque,
      );
      if (context) {
        try {
          await this.advanceContext(context, evaluatedAt);
        } catch (error) {
          const message = this.getErrorMessage(error);
          this.logger.error(
            `Falha no encerramento do tanque ${context.id_processo_tanque}: ${message}`,
          );
          await this.markFailure(context, message);
        }
      }
    }

    const ready = await this.prisma.processostanques.findFirst({
      where: {
        id_processo: idProcesso,
        status_encerramento: statusencerramentotanque.PRONTO_PARA_ENCERRAR,
        processos: {
          status_processo: statusprocesso.EM_EXECUCAO,
          encerramento_automatico: true,
        },
      },
      orderBy: { id_processo_tanque: 'asc' },
      select: { id_processo_tanque: true },
    });

    if (!ready) {
      return;
    }

    const context = await this.findContext(
      idProcesso,
      ready.id_processo_tanque,
    );
    if (!context) {
      return;
    }

    try {
      this.assertEligibleForIsolation(context, evaluatedAt);
    } catch (error) {
      this.logger.debug(
        `Tanque ${context.id_processo_tanque} ainda nao pode ser isolado: ${this.getErrorMessage(error)}`,
      );
      return;
    }

    if (!context.processos.encerramento_automatico) {
      return;
    }

    const claimed = await this.claimIsolation(
      context,
      context.encerramento_versao,
    );
    if (!claimed) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      action: 'ENCERRAMENTO_TANQUE_AUTOMATICO_INICIADO',
      description: `Tanque ${context.id_tanque} elegivel; isolamento automatico iniciado.`,
    });
    await this.emitClosureUpdate(
      context.id_processo,
      context.id_processo_tanque,
      context.status_encerramento,
      'Estabilizacao aprovada; isolamento automatico iniciado.',
    );
  }

  private async advanceContext(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    if (
      context.encerramento_proxima_tentativa_em &&
      context.encerramento_proxima_tentativa_em > evaluatedAt
    ) {
      return;
    }
    if (context.processos.status_processo !== statusprocesso.EM_EXECUCAO) {
      return;
    }

    if (context.status_encerramento === statusencerramentotanque.ISOLANDO) {
      await this.advanceIsolation(context, evaluatedAt);
      return;
    }
    if (
      context.status_encerramento ===
      statusencerramentotanque.VERIFICANDO_RETENCAO
    ) {
      await this.advanceRetention(context, evaluatedAt);
      return;
    }
    if (
      context.status_encerramento === statusencerramentotanque.BLOQUEADO &&
      context.etapa_encerramento ===
        etapaencerramentotanque.REABRINDO_VALVULA_PRINCIPAL
    ) {
      await this.rollbackRetention(context, evaluatedAt);
      return;
    }

    await this.markFailure(
      context,
      'Estado persistido de encerramento individual e etapa operacional divergentes.',
    );
  }

  private async advanceIsolation(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    const safetyFailure = this.resolveSafetyFailure(context, evaluatedAt);
    if (safetyFailure) {
      await this.markFailure(context, safetyFailure);
      return;
    }

    if (
      context.etapa_encerramento ===
      etapaencerramentotanque.AGUARDANDO_AUXILIAR_SEGURO
    ) {
      await this.ensureAuxiliarySafe(context, evaluatedAt);
      return;
    }
    if (
      context.etapa_encerramento ===
      etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL
    ) {
      await this.closeMainValve(context, evaluatedAt);
      return;
    }

    await this.markFailure(
      context,
      `Etapa ${context.etapa_encerramento} invalida durante isolamento.`,
    );
  }

  private async ensureAuxiliarySafe(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    const { auxiliary } = this.resolveValves(context);
    const subsystem = context.processos.processosauxiliares;
    const tankAuxiliary = context.processostanquesauxiliares;

    if (!subsystem || !tankAuxiliary) {
      await this.markFailure(
        context,
        'Contrato persistido do subsistema auxiliar esta ausente.',
      );
      return;
    }

    const pumpRunning = auxiliary.bombas.ligada_hardware;
    const isCurrentTank =
      subsystem.id_processo_tanque_atual === context.id_processo_tanque;
    const anotherCurrentTank =
      subsystem.id_processo_tanque_atual !== null && !isCurrentTank;

    if (
      auxiliary.status_valvula === StatusValvula.ABERTA &&
      anotherCurrentTank
    ) {
      await this.markFailure(
        context,
        'Valvula auxiliar do tanque esta aberta enquanto outro tanque consta como atendido.',
      );
      return;
    }

    if (isCurrentTank && pumpRunning === true) {
      await this.executeAuxiliaryCommand(
        context,
        ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        undefined,
        subsystem.versao,
        undefined,
        'Desligar bomba auxiliar antes de isolar o tanque estabilizado.',
      );
      return;
    }

    if (
      (isCurrentTank || auxiliary.status_valvula === StatusValvula.ABERTA) &&
      pumpRunning !== false
    ) {
      await this.recordCommandFailure(
        context,
        'Telemetria nao confirmou a bomba auxiliar desligada antes do fechamento da valvula.',
        evaluatedAt,
      );
      return;
    }

    if (isCurrentTank || auxiliary.status_valvula === StatusValvula.ABERTA) {
      await this.executeAuxiliaryCommand(
        context,
        ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
        context.id_processo_tanque,
        subsystem.versao,
        tankAuxiliary.versao,
        'Fechar e confirmar a valvula auxiliar antes do isolamento principal.',
      );
      return;
    }

    if (auxiliary.status_valvula !== StatusValvula.FECHADA) {
      await this.markFailure(
        context,
        `Valvula auxiliar sem estado fisico seguro: ${auxiliary.status_valvula}.`,
      );
      return;
    }

    await this.moveStage(
      context,
      etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
      'Ramo auxiliar confirmado em estado seguro.',
    );
  }

  private async executeAuxiliaryCommand(
    context: ClosureContext,
    action: ProcessoAuxiliarSafetyAction,
    idProcessoTanque: number | undefined,
    subsystemVersion: number,
    tankVersion: number | undefined,
    reason: string,
  ): Promise<void> {
    try {
      await this.auxiliaryCommandService.executeAutomaticCommand({
        id_processo: context.id_processo,
        id_processo_tanque: idProcessoTanque,
        action,
        expected_subsystem_version: subsystemVersion,
        expected_tank_version: tankVersion,
        motivo: reason,
        correlation_id: this.buildCorrelationId(context, action.toLowerCase()),
      });
      await this.touchAfterCommand(context, reason);
    } catch (error) {
      await this.recordCommandFailure(
        context,
        `Falha ao preparar subsistema auxiliar: ${this.getErrorMessage(error)}`,
        new Date(),
      );
    }
  }

  private async closeMainValve(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    const { main } = this.resolveValves(context);

    try {
      const command = await this.commandService.fecharValvula(
        this.buildCommandOptions(
          context,
          'close-main',
          'Isolar tanque estabilizado para teste de retencao.',
        ),
        main.id_valvula,
        this.requireHardwareCode(main.codigo_hardware, 'valvula principal'),
        {
          id_tanque: context.id_tanque,
          id_processo_tanque: context.id_processo_tanque,
        },
      );
      const isolatedAt = command.ack_received_at ?? evaluatedAt;
      const updated = await this.prisma.processostanques.updateMany({
        where: {
          id_processo_tanque: context.id_processo_tanque,
          encerramento_versao: context.encerramento_versao,
          status_encerramento: statusencerramentotanque.ISOLANDO,
          etapa_encerramento:
            etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
        },
        data: {
          status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
          etapa_encerramento:
            etapaencerramentotanque.AGUARDANDO_LEITURA_ISOLAMENTO,
          isolado_em: isolatedAt,
          retencao_iniciada_em: null,
          retencao_finalizada_em: null,
          vacuo_isolamento: null,
          perda_vacuo_retencao: null,
          encerramento_comando_tentativas: 0,
          encerramento_proxima_tentativa_em: null,
          motivo_bloqueio_encerramento: null,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'ACK da valvula principal chegou, mas o estado do tanque mudou.',
        );
      }

      await this.safeRegisterLog({
        id_processo: context.id_processo,
        action: 'TANQUE_ISOLADO',
        description:
          `Tanque ${context.id_tanque} isolado com ACK ${command.correlation_id}. ` +
          'Aguardando a primeira leitura posterior ao isolamento.',
      });
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        'Valvula principal fechada com ACK; aguardando leitura de isolamento.',
      );
    } catch (error) {
      await this.recordCommandFailure(
        context,
        `Falha ao confirmar fechamento da valvula principal: ${this.getErrorMessage(error)}`,
        evaluatedAt,
      );
    }
  }

  private async advanceRetention(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    const safetyFailure = this.resolveSafetyFailure(context, evaluatedAt);
    if (safetyFailure) {
      await this.markFailure(context, safetyFailure);
      return;
    }

    const latest = this.resolveLatestReading(context);
    if (!latest) {
      await this.markFailure(
        context,
        'Leitura de vacuo ausente durante verificacao de retencao.',
      );
      return;
    }

    if (
      context.etapa_encerramento ===
      etapaencerramentotanque.AGUARDANDO_LEITURA_ISOLAMENTO
    ) {
      if (!context.isolado_em) {
        await this.markFailure(
          context,
          'Instante de isolamento ausente para iniciar a retencao.',
        );
        return;
      }
      if (latest.recebido_em <= context.isolado_em) {
        return;
      }

      const vacuum = this.readingValue(latest);
      const updated = await this.prisma.processostanques.updateMany({
        where: {
          id_processo_tanque: context.id_processo_tanque,
          encerramento_versao: context.encerramento_versao,
          etapa_encerramento:
            etapaencerramentotanque.AGUARDANDO_LEITURA_ISOLAMENTO,
        },
        data: {
          etapa_encerramento: etapaencerramentotanque.RETENDO,
          retencao_iniciada_em: latest.recebido_em,
          vacuo_isolamento: vacuum,
          perda_vacuo_retencao: 0,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count === 1) {
        await this.emitClosureUpdate(
          context.id_processo,
          context.id_processo_tanque,
          context.status_encerramento,
          'Retencao iniciada com leitura posterior ao isolamento.',
        );
      }
      return;
    }

    if (context.etapa_encerramento !== etapaencerramentotanque.RETENDO) {
      await this.markFailure(
        context,
        `Etapa ${context.etapa_encerramento} invalida durante retencao.`,
      );
      return;
    }

    if (!context.retencao_iniciada_em || context.vacuo_isolamento === null) {
      await this.markFailure(
        context,
        'Evidencia inicial da retencao esta incompleta.',
      );
      return;
    }

    const vacuum = this.readingValue(latest);
    const vacuumLoss = Math.max(
      0,
      Math.abs(context.vacuo_isolamento.toNumber()) - Math.abs(vacuum),
    );
    const maximumLoss =
      context.processos.encerramento_perda_vacuo_maxima_retencao.toNumber();

    if (vacuumLoss > maximumLoss) {
      await this.rejectRetention(context, vacuumLoss, maximumLoss);
      return;
    }

    const elapsedMs =
      evaluatedAt.getTime() - context.retencao_iniciada_em.getTime();
    if (
      elapsedMs >=
      context.processos.encerramento_tempo_retencao_segundos * 1000
    ) {
      await this.completeTankClosure(context, vacuum, vacuumLoss, evaluatedAt);
      return;
    }

    const persistedLoss = context.perda_vacuo_retencao?.toNumber() ?? 0;
    if (Math.abs(persistedLoss - vacuumLoss) < 0.0005) {
      return;
    }

    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
      },
      data: {
        perda_vacuo_retencao: vacuumLoss,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        'Retencao em andamento dentro da perda maxima permitida.',
      );
    }
  }

  private async rejectRetention(
    context: ClosureContext,
    vacuumLoss: number,
    maximumLoss: number,
  ): Promise<void> {
    const reason =
      `Retencao reprovada: perda de vacuo ${vacuumLoss.toFixed(3)} ` +
      `superou o limite ${maximumLoss.toFixed(3)}.`;
    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
      },
      data: {
        status_encerramento: statusencerramentotanque.BLOQUEADO,
        etapa_encerramento: etapaencerramentotanque.REABRINDO_VALVULA_PRINCIPAL,
        perda_vacuo_retencao: vacuumLoss,
        retencao_finalizada_em: new Date(),
        motivo_bloqueio_encerramento: reason,
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      action: 'RETENCAO_TANQUE_REPROVADA',
      description: `Tanque ${context.id_tanque}. ${reason}`,
      result: resultadooperacao.FALHA,
    });
    await this.emitClosureUpdate(
      context.id_processo,
      context.id_processo_tanque,
      context.status_encerramento,
      `${reason} Iniciando retorno controlado a geracao de vacuo.`,
    );
  }

  private async rollbackRetention(
    context: ClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    const safetyFailure = this.resolveSafetyFailure(context, evaluatedAt);
    if (safetyFailure) {
      await this.markFailure(context, safetyFailure);
      return;
    }

    const { main } = this.resolveValves(context);
    try {
      const command = await this.commandService.abrirValvula(
        this.buildCommandOptions(
          context,
          'reopen-main',
          'Reabrir valvula principal apos reprovacao da retencao.',
        ),
        main.id_valvula,
        this.requireHardwareCode(main.codigo_hardware, 'valvula principal'),
        {
          id_tanque: context.id_tanque,
          id_processo_tanque: context.id_processo_tanque,
        },
      );
      const updated = await this.prisma.processostanques.updateMany({
        where: {
          id_processo_tanque: context.id_processo_tanque,
          encerramento_versao: context.encerramento_versao,
          etapa_encerramento:
            etapaencerramentotanque.REABRINDO_VALVULA_PRINCIPAL,
        },
        data: {
          status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
          vacuo_atingido: false,
          vacuo_estabilizado: false,
          status_estagnacao: statusestagnacao.NORMAL,
          estagnacao_iniciada_em: null,
          estagnacao_detectada_em: null,
          estagnacao_ultima_avaliacao_em: null,
          estagnacao_variacao_vacuo: null,
          estagnacao_leituras_janela: 0,
          estagnacao_janelas_sem_progresso: 0,
          status_encerramento: statusencerramentotanque.MONITORANDO,
          etapa_encerramento: etapaencerramentotanque.NENHUMA,
          encerramento_iniciado_em: null,
          isolado_em: null,
          retencao_iniciada_em: null,
          retencao_finalizada_em: null,
          vacuo_isolamento: null,
          perda_vacuo_retencao: null,
          encerramento_comando_tentativas: 0,
          encerramento_proxima_tentativa_em: null,
          motivo_bloqueio_encerramento:
            'Retencao reprovada; nova estabilizacao iniciada.',
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'ACK de reabertura chegou, mas o estado do tanque mudou.',
        );
      }

      await this.safeRegisterLog({
        id_processo: context.id_processo,
        action: 'RETENCAO_TANQUE_ROLLBACK_CONCLUIDO',
        description:
          `Valvula principal do tanque ${context.id_tanque} reaberta com ACK ` +
          `${command.correlation_id}; estabilizacao reiniciada.`,
      });
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        'Retorno controlado confirmado; tanque voltou a gerar vacuo.',
      );
    } catch (error) {
      await this.recordCommandFailure(
        context,
        `Falha ao confirmar reabertura da valvula principal: ${this.getErrorMessage(error)}`,
        evaluatedAt,
      );
    }
  }

  private async completeTankClosure(
    context: ClosureContext,
    vacuum: number,
    vacuumLoss: number,
    completedAt: Date,
  ): Promise<void> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const tank = await tx.processostanques.updateMany({
        where: {
          id_processo_tanque: context.id_processo_tanque,
          encerramento_versao: context.encerramento_versao,
          etapa_encerramento: etapaencerramentotanque.RETENDO,
          processos: { status_processo: statusprocesso.EM_EXECUCAO },
        },
        data: {
          status_tanque_processo: statustanqueprocesso.CONCLUIDO,
          finalizado_em: completedAt,
          vacuo_final: vacuum,
          vacuo_atingido: true,
          vacuo_estabilizado: true,
          status_estagnacao: statusestagnacao.NORMAL,
          estagnacao_iniciada_em: null,
          estagnacao_detectada_em: null,
          estagnacao_ultima_avaliacao_em: null,
          estagnacao_variacao_vacuo: null,
          estagnacao_leituras_janela: 0,
          estagnacao_janelas_sem_progresso: 0,
          status_encerramento: statusencerramentotanque.CONCLUIDO,
          etapa_encerramento: etapaencerramentotanque.CONCLUIDA,
          retencao_finalizada_em: completedAt,
          perda_vacuo_retencao: vacuumLoss,
          motivo_bloqueio_encerramento: null,
          encerramento_comando_tentativas: 0,
          encerramento_proxima_tentativa_em: null,
          encerramento_versao: { increment: 1 },
        },
      });
      if (tank.count !== 1) {
        return false;
      }

      await tx.alarmes.updateMany({
        where: {
          id_processo: context.id_processo,
          id_processo_tanque: context.id_processo_tanque,
          tipo_alarme: tipoalarme.ESTAGNACAO,
          status_alarme: statusalarme.ATIVO,
          resolvido_em: null,
          excluido_em: null,
        },
        data: {
          status_alarme: statusalarme.NORMALIZADO,
          normalizado_em: completedAt,
          motivo_resolucao: motivoresolucaoalarme.AUTO_RECUPERADO,
        },
      });
      return true;
    });

    if (!updated) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      action: 'ENCERRAMENTO_TANQUE_CONCLUIDO',
      description:
        `Tanque ${context.id_tanque} concluiu isolamento e retencao. ` +
        `Perda final: ${vacuumLoss.toFixed(3)}. Os demais tanques permanecem ativos.`,
    });
    await this.emitClosureUpdate(
      context.id_processo,
      context.id_processo_tanque,
      context.status_encerramento,
      'Retencao aprovada; somente este tanque foi concluido.',
    );
  }

  private async claimIsolation(
    context: ClosureContext,
    expectedVersion: number,
  ): Promise<boolean> {
    const now = new Date();
    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        id_processo: context.id_processo,
        encerramento_versao: expectedVersion,
        status_encerramento: context.status_encerramento,
        status_tanque_processo: statustanqueprocesso.VACUO_ESTABILIZADO,
        processos: { status_processo: statusprocesso.EM_EXECUCAO },
      },
      data: {
        status_encerramento: statusencerramentotanque.ISOLANDO,
        etapa_encerramento: etapaencerramentotanque.AGUARDANDO_AUXILIAR_SEGURO,
        encerramento_iniciado_em: now,
        isolado_em: null,
        retencao_iniciada_em: null,
        retencao_finalizada_em: null,
        vacuo_isolamento: null,
        perda_vacuo_retencao: null,
        motivo_bloqueio_encerramento: null,
        encerramento_tentativa: { increment: 1 },
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        encerramento_versao: { increment: 1 },
      },
    });

    return updated.count === 1;
  }

  private assertEligibleForIsolation(
    context: ClosureContext,
    evaluatedAt: Date,
  ): void {
    if (context.processos.status_processo !== statusprocesso.EM_EXECUCAO) {
      throw new ConflictException('Processo nao esta em execucao.');
    }
    if (
      context.status_tanque_processo !== statustanqueprocesso.VACUO_ESTABILIZADO
    ) {
      throw new ConflictException('Tanque ainda nao estabilizou o vacuo alvo.');
    }
    if (context.processos.alarmes.length > 0) {
      throw new ConflictException(
        'Existe alarme critico ativo bloqueando o isolamento.',
      );
    }

    const safetyFailure = this.resolveSafetyFailure(context, evaluatedAt);
    if (safetyFailure) {
      throw new ConflictException(safetyFailure);
    }
    const latest = this.resolveLatestReading(context);
    const currentVacuum = this.readingValue(latest);
    if (!this.isWithinTarget(context, currentVacuum)) {
      throw new ConflictException(
        'Ultima leitura nao permanece dentro da tolerancia do vacuo alvo.',
      );
    }

    const { main, auxiliary } = this.resolveValves(context);
    this.requireHardwareCode(main.codigo_hardware, 'valvula principal');
    this.requireHardwareCode(auxiliary.codigo_hardware, 'valvula auxiliar');
    if (main.status_valvula !== StatusValvula.ABERTA) {
      throw new ConflictException(
        'Valvula principal precisa estar confirmadamente aberta antes do isolamento.',
      );
    }
  }

  private resolveSafetyFailure(
    context: ClosureContext,
    evaluatedAt: Date,
  ): string | null {
    const coupling = context.tanques.sensoresacoplamentomangueiras;
    if (
      !coupling?.ativo ||
      coupling.status_acoplamento !== StatusAcoplamentoMangueira.ACOPLADA ||
      !coupling.sinal_detectado
    ) {
      return 'Mangueira desacoplada ou sem confirmacao durante o encerramento individual.';
    }

    const unavailableSensor = context.processostanquessensores.find(
      (assignment) => assignment.sensores.status_sensor !== statussensor.ATIVO,
    );
    if (unavailableSensor) {
      return (
        `Sensor de vacuo ${unavailableSensor.id_sensor} indisponivel durante ` +
        `o encerramento individual: ${unavailableSensor.sensores.status_sensor}.`
      );
    }

    const latest = this.resolveLatestReading(context);
    if (!latest) {
      return 'Sensor de vacuo sem leitura valida para o encerramento individual.';
    }
    const timeout = context.processos.encerramento_timeout_leitura_sensor_ms;
    if (evaluatedAt.getTime() - latest.recebido_em.getTime() > timeout) {
      return `Leitura de vacuo excedeu o timeout de ${timeout} ms.`;
    }

    const vacuum = this.readingValue(latest);
    const safetyLimit =
      context.processos.encerramento_limite_seguranca_vacuo.toNumber();
    if (Math.abs(vacuum) > Math.abs(safetyLimit)) {
      return `Limite de seguranca de vacuo excedido: ${vacuum}.`;
    }

    return null;
  }

  private resolveValves(context: ClosureContext): {
    main: ClosureValve;
    auxiliary: ClosureValve;
  } {
    const mainValves = context.tanques.valvulas.filter(
      (valve) => valve.bombas.tipo_bomba === tipobomba.PRINCIPAL,
    );
    const auxiliaryValves = context.tanques.valvulas.filter(
      (valve) => valve.bombas.tipo_bomba === tipobomba.AUXILIAR,
    );
    if (mainValves.length !== 1 || auxiliaryValves.length !== 1) {
      throw new ConflictException(
        'Tanque precisa de exatamente uma valvula principal e uma auxiliar ativas.',
      );
    }

    return { main: mainValves[0], auxiliary: auxiliaryValves[0] };
  }

  private async moveStage(
    context: ClosureContext,
    stage: etapaencerramentotanque,
    message: string,
  ): Promise<void> {
    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento: context.etapa_encerramento,
      },
      data: {
        etapa_encerramento: stage,
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        motivo_bloqueio_encerramento: null,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        message,
      );
    }
  }

  private async touchAfterCommand(
    context: ClosureContext,
    message: string,
  ): Promise<void> {
    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento: context.etapa_encerramento,
      },
      data: {
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        motivo_bloqueio_encerramento: null,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        message,
      );
    }
  }

  private async recordCommandFailure(
    context: ClosureContext,
    reason: string,
    evaluatedAt: Date,
  ): Promise<void> {
    const attempts = context.encerramento_comando_tentativas + 1;
    if (attempts >= MAX_COMMAND_ATTEMPTS) {
      await this.markFailure(
        context,
        `${reason} Limite de ${MAX_COMMAND_ATTEMPTS} tentativas atingido.`,
      );
      return;
    }

    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento: context.etapa_encerramento,
      },
      data: {
        encerramento_comando_tentativas: attempts,
        encerramento_proxima_tentativa_em: new Date(
          evaluatedAt.getTime() + COMMAND_RETRY_DELAY_MS,
        ),
        motivo_bloqueio_encerramento: reason,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.safeRegisterLog({
        id_processo: context.id_processo,
        action: 'ENCERRAMENTO_TANQUE_COMANDO_REPETIR',
        description: `Tanque ${context.id_tanque}; tentativa ${attempts}/${MAX_COMMAND_ATTEMPTS}. ${reason}`,
        result: resultadooperacao.FALHA,
      });
      await this.emitClosureUpdate(
        context.id_processo,
        context.id_processo_tanque,
        context.status_encerramento,
        reason,
      );
    }
  }

  private async markFailure(
    context: ClosureContext,
    reason: string,
  ): Promise<void> {
    const updated = await this.prisma.processostanques.updateMany({
      where: {
        id_processo_tanque: context.id_processo_tanque,
        encerramento_versao: context.encerramento_versao,
      },
      data: {
        status_encerramento: statusencerramentotanque.FALHA,
        etapa_encerramento: etapaencerramentotanque.FALHA,
        motivo_bloqueio_encerramento: reason,
        encerramento_proxima_tentativa_em: null,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      action: 'ENCERRAMENTO_TANQUE_FALHA',
      description: `Tanque ${context.id_tanque}. ${reason}`,
      result: resultadooperacao.FALHA,
    });
    await this.emitClosureUpdate(
      context.id_processo,
      context.id_processo_tanque,
      context.status_encerramento,
      reason,
    );
  }

  private async emitClosureUpdate(
    idProcesso: number,
    idProcessoTanque: number,
    previousStatus: statusencerramentotanque,
    message: string,
  ): Promise<ProcessoTanqueEncerramentoState> {
    const context = await this.findContext(idProcesso, idProcessoTanque);
    if (!context) {
      throw new NotFoundException('Tanque do processo nao encontrado.');
    }
    const closure = this.buildClosureState(context);

    this.socketGateway.emitTankClosureUpdated({
      id_processo: idProcesso,
      id_processo_tanque: idProcessoTanque,
      id_tanque: context.id_tanque,
      previous_status: previousStatus,
      closure,
      message,
      emitted_at: new Date(),
    });

    return closure;
  }

  private buildClosureState(
    context: ClosureContext,
  ): ProcessoTanqueEncerramentoState {
    const latest = this.resolveLatestReading(context);
    const currentVacuum = latest ? this.readingValue(latest) : null;
    const safetyLimit =
      context.processos.encerramento_limite_seguranca_vacuo.toNumber();
    const coupling = context.tanques.sensoresacoplamentomangueiras;

    return {
      status: context.status_encerramento,
      etapa: context.etapa_encerramento,
      automatico: context.processos.encerramento_automatico,
      pronto_para_encerrar:
        context.status_encerramento ===
        statusencerramentotanque.PRONTO_PARA_ENCERRAR,
      aguardando_acao_manual:
        context.status_encerramento ===
        statusencerramentotanque.AGUARDANDO_ACAO_MANUAL,
      pode_desacoplar: false,
      mangueira_acoplada: coupling
        ? coupling.ativo &&
          coupling.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA &&
          coupling.sinal_detectado
        : null,
      iniciado_em: context.encerramento_iniciado_em,
      isolado_em: context.isolado_em,
      retencao_iniciada_em: context.retencao_iniciada_em,
      retencao_finalizada_em: context.retencao_finalizada_em,
      vacuo_isolamento: context.vacuo_isolamento?.toNumber() ?? null,
      perda_vacuo_retencao: context.perda_vacuo_retencao?.toNumber() ?? null,
      motivo_bloqueio: context.motivo_bloqueio_encerramento,
      versao: context.encerramento_versao,
      tentativa: context.encerramento_tentativa,
      comando_tentativas: context.encerramento_comando_tentativas,
      proxima_tentativa_em: context.encerramento_proxima_tentativa_em,
      estabilizacao: {
        tempo_necessario_segundos:
          context.processos.encerramento_tempo_estabilizacao_segundos,
        cobertura_minima_percentual:
          context.processos.encerramento_estabilizacao_cobertura_minima_percentual.toNumber(),
        leituras_esperadas: context.estabilizacao_leituras_esperadas,
        leituras_observadas: context.estabilizacao_leituras_observadas,
        cobertura_atual_percentual:
          context.estabilizacao_cobertura_percentual.toNumber(),
        maior_intervalo_ms: context.estabilizacao_maior_intervalo_ms,
        timeout_leitura_ms:
          context.processos.encerramento_timeout_leitura_sensor_ms,
        continuidade_aprovada:
          context.estabilizacao_maior_intervalo_ms <=
          context.processos.encerramento_timeout_leitura_sensor_ms,
      },
      retencao: {
        tempo_necessario_segundos:
          context.processos.encerramento_tempo_retencao_segundos,
        perda_maxima_permitida:
          context.processos.encerramento_perda_vacuo_maxima_retencao.toNumber(),
      },
      seguranca: {
        limite_vacuo: safetyLimit,
        limite_excedido:
          currentVacuum !== null &&
          Math.abs(currentVacuum) > Math.abs(safetyLimit),
      },
    };
  }

  private findContext(idProcesso: number, idProcessoTanque: number) {
    return this.prisma.processostanques.findFirst({
      where: {
        id_processo: idProcesso,
        id_processo_tanque: idProcessoTanque,
      },
      select: CLOSURE_CONTEXT_SELECT,
    });
  }

  private resolveLatestReading(context: ClosureContext) {
    return context.processostanquessensores
      .flatMap((sensor) => sensor.leiturasensores)
      .sort((left, right) => {
        const byReceived =
          right.recebido_em.getTime() - left.recebido_em.getTime();
        return byReceived !== 0
          ? byReceived
          : right.id_leitura_sensor - left.id_leitura_sensor;
      })[0];
  }

  private readingValue(input: {
    valor_vacuo: Prisma.Decimal | null;
    valor: Prisma.Decimal;
  }): number {
    return (input.valor_vacuo ?? input.valor).toNumber();
  }

  private isWithinTarget(context: ClosureContext, vacuum: number): boolean {
    const target = Math.abs(context.vacuo_alvo.toNumber());
    const current = Math.abs(vacuum);
    const tolerance = Math.min(
      100,
      Math.max(
        0,
        context.processos.encerramento_tolerancia_vacuo_percentual.toNumber(),
      ),
    );
    if (target === 0) {
      return current <= 0.001;
    }
    return (
      current >= target * (1 - tolerance / 100) &&
      current <= target * (1 + tolerance / 100)
    );
  }

  private buildCommandOptions(
    context: ClosureContext,
    action: string,
    reason: string,
  ): CommandOptions {
    return {
      id_processo: context.id_processo,
      motivo: `Tanque ${context.id_tanque}: ${reason}`,
      correlation_id: this.buildCorrelationId(context, action),
    };
  }

  private buildCorrelationId(context: ClosureContext, action: string): string {
    return [
      'closure',
      `p${context.id_processo}`,
      `t${context.id_processo_tanque}`,
      `a${context.encerramento_tentativa}`,
      action,
    ].join('-');
  }

  private requireHardwareCode(value: string | null, label: string): string {
    const code = value?.trim();
    if (!code) {
      throw new ConflictException(
        `codigo_hardware ausente para ${label}; comando bloqueado.`,
      );
    }
    return code;
  }

  private enqueueProcess<T>(
    idProcesso: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.processQueues.get(idProcesso) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.processQueues.set(idProcesso, tail);

    return current.finally(() => {
      if (this.processQueues.get(idProcesso) === tail) {
        this.processQueues.delete(idProcesso);
      }
    });
  }

  private async safeRegisterLog(input: {
    id_processo: number;
    id_usuario?: number;
    action: string;
    description: string;
    result?: resultadooperacao;
  }): Promise<void> {
    try {
      if (input.id_usuario) {
        await this.processoLogService.registerUserAction({
          id_processo: input.id_processo,
          id_usuario: input.id_usuario,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        });
      } else {
        await this.processoLogService.registerSystemAction({
          id_processo: input.id_processo,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        });
      }
    } catch (error) {
      this.logger.error(
        `Falha ao registrar log ${input.action}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro desconhecido.';
  }
}
