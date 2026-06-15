import { Injectable } from '@nestjs/common';
import { statusprocesso, statustanqueprocesso } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AcoplamentoOperationalContext } from '../interfaces';

@Injectable()
export class AcoplamentoContextCacheService {
  private readonly ttlMs = 2_000;
  private readonly cache = new Map<
    string,
    {
      value: AcoplamentoOperationalContext;
      expiresAt: number;
    }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async getContext(params: {
    id_sensor: number;
    id_tanque: number;
  }): Promise<AcoplamentoOperationalContext> {
    const key = this.makeKey(params.id_sensor, params.id_tanque);
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const processoTanqueSensor =
      await this.prisma.processostanquessensores.findFirst({
        where: {
          id_sensor: params.id_sensor,
          ativo: true,
          processostanques: {
            id_tanque: params.id_tanque,
            status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
            processos: {
              status_processo: statusprocesso.EM_EXECUCAO,
            },
          },
        },
        select: {
          id_processo_tanque_sensor: true,
          processostanques: {
            select: {
              id_processo_tanque: true,
              processos: {
                select: {
                  id_processo: true,
                },
              },
            },
          },
        },
      });

    const value: AcoplamentoOperationalContext = processoTanqueSensor
      ? {
          processo_em_execucao: true,
          id_processo:
            processoTanqueSensor.processostanques.processos.id_processo,
          id_processo_tanque:
            processoTanqueSensor.processostanques.id_processo_tanque,
          id_processo_tanque_sensor:
            processoTanqueSensor.id_processo_tanque_sensor,
        }
      : {
          processo_em_execucao: false,
          id_sensor: params.id_sensor,
          id_tanque: params.id_tanque,
        };

    this.cache.set(key, {
      value,
      expiresAt: now + this.ttlMs,
    });

    return value;
  }

  invalidate(params?: { id_sensor: number; id_tanque: number }): void {
    if (!params) {
      this.cache.clear();
      return;
    }

    this.cache.delete(this.makeKey(params.id_sensor, params.id_tanque));
  }

  private makeKey(idSensor: number, idTanque: number): string {
    return `sensor:${idSensor}:tanque:${idTanque}`;
  }
}
