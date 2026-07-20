import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CachedReadingContext } from '../interfaces';
import { SystemConfigCacheService } from './system-config-cache.service';

@Injectable()
export class ReadingContextCacheService {
  private readonly ttlMs = 3_000;
  private readonly cache = new Map<
    number,
    {
      value: CachedReadingContext;
      expiresAt: number;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfigCache: SystemConfigCacheService,
  ) {}

  async getContext(
    idProcessoTanqueSensor: number,
  ): Promise<CachedReadingContext | null> {
    const now = Date.now();

    const cached = this.cache.get(idProcessoTanqueSensor);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const [processoTanqueSensor, systemConfig] = await Promise.all([
      this.prisma.processostanquessensores.findUnique({
        where: {
          id_processo_tanque_sensor: idProcessoTanqueSensor,
        },
        select: {
          id_processo_tanque_sensor: true,
          id_sensor: true,
          sensores: {
            select: {
              unidade_medida: true,
            },
          },
          processostanques: {
            select: {
              id_processo_tanque: true,
              id_tanque: true,
              vacuo_alvo: true,
              status_tanque_processo: true,
              processos: {
                select: {
                  id_processo: true,
                  status_processo: true,
                  encerramento_limite_seguranca_vacuo: true,
                  encerramento_tolerancia_vacuo_percentual: true,
                },
              },
            },
          },
        },
      }),
      this.systemConfigCache.getConfig(),
    ]);

    if (!processoTanqueSensor) {
      return null;
    }

    const value: CachedReadingContext = {
      id_processo: processoTanqueSensor.processostanques.processos.id_processo,
      id_processo_tanque:
        processoTanqueSensor.processostanques.id_processo_tanque,
      id_processo_tanque_sensor: processoTanqueSensor.id_processo_tanque_sensor,
      id_tanque: processoTanqueSensor.processostanques.id_tanque,
      id_sensor: processoTanqueSensor.id_sensor,
      status_processo:
        processoTanqueSensor.processostanques.processos.status_processo,
      status_tanque_processo:
        processoTanqueSensor.processostanques.status_tanque_processo,
      vacuo_alvo: processoTanqueSensor.processostanques.vacuo_alvo.toNumber(),
      unidade_medida: processoTanqueSensor.sensores.unidade_medida,
      limite_seguranca_vacuo:
        processoTanqueSensor.processostanques.processos.encerramento_limite_seguranca_vacuo?.toNumber() ??
        systemConfig.limite_seguranca_vacuo,
      tolerancia_vacuo_percentual:
        processoTanqueSensor.processostanques.processos.encerramento_tolerancia_vacuo_percentual?.toNumber() ??
        systemConfig.tolerancia_vacuo_percentual,
    };

    this.cache.set(idProcessoTanqueSensor, {
      value,
      expiresAt: now + this.ttlMs,
    });

    return value;
  }

  invalidate(idProcessoTanqueSensor?: number): void {
    if (idProcessoTanqueSensor) {
      this.cache.delete(idProcessoTanqueSensor);
      return;
    }

    this.cache.clear();
  }
}
