import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  statusintegridadesensor,
  statusprocesso,
  statussensor,
  tipoalarme,
  tiposensor,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SensorIntegrityMonitorService {
  private readonly logger = new Logger(SensorIntegrityMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_SECONDS, {
    name: 'sensor-integrity-timeout',
    waitForCompletion: true,
    disabled:
      process.env.NODE_ENV === 'test' ||
      process.env.SENSOR_INTEGRITY_MONITOR_DISABLED === 'true',
  })
  async monitorTimeouts(evaluatedAt = new Date()): Promise<number> {
    const links = await this.prisma.processostanquessensores.findMany({
      where: {
        ativo: true,
        removido_em: null,
        processostanques: {
          processos: { status_processo: statusprocesso.EM_EXECUCAO },
        },
        sensores: {
          tipo_sensor: tiposensor.VACUO,
          status_sensor: statussensor.ATIVO,
          status_integridade: statusintegridadesensor.VALIDO,
          excluido_em: null,
        },
      },
      select: {
        id_processo_tanque_sensor: true,
        id_processo_tanque: true,
        id_sensor: true,
        sensores: { select: { ultima_leitura: true } },
        processostanques: {
          select: {
            id_processo: true,
            processos: {
              select: { encerramento_timeout_leitura_sensor_ms: true },
            },
          },
        },
      },
    });

    let failures = 0;
    for (const link of links) {
      const timeoutMs = Math.max(
        1000,
        link.processostanques.processos.encerramento_timeout_leitura_sensor_ms,
      );
      const lastReading = link.sensores.ultima_leitura;
      if (
        lastReading &&
        evaluatedAt.getTime() - lastReading.getTime() <= timeoutMs
      ) {
        continue;
      }

      const reason = `Timeout de leitura: nenhuma amostra valida recebida nos ultimos ${timeoutMs}ms.`;
      const changed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.sensores.updateMany({
          where: {
            id_sensor: link.id_sensor,
            status_sensor: statussensor.ATIVO,
            status_integridade: statusintegridadesensor.VALIDO,
          },
          data: {
            status_sensor: statussensor.DESCONECTADO,
            status_integridade: statusintegridadesensor.TIMEOUT,
            integridade_ultimo_erro: reason,
            integridade_validada_em: evaluatedAt,
            liberado_em: null,
            id_usuario_liberacao: null,
          },
        });
        if (updated.count !== 1) {
          return false;
        }

        await tx.alarmes.create({
          data: {
            id_processo: link.processostanques.id_processo,
            id_processo_tanque: link.id_processo_tanque,
            id_processo_tanque_sensor: link.id_processo_tanque_sensor,
            titulo: `Timeout do sensor ${link.id_sensor}`,
            descricao: reason,
            tipo_alarme: tipoalarme.SENSOR,
            severidade: severidadealarme.CRITICO,
            status_alarme: statusalarme.ATIVO,
            origem_alarme: origemalarme.BACKEND,
            ocorrido_em: evaluatedAt,
            bloqueante: true,
            requer_intervencao: true,
            recuperacao_automatica: false,
          },
        });
        return true;
      });

      if (changed) {
        failures += 1;
        this.logger.error(reason);
      }
    }

    return failures;
  }
}
