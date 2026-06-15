import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CachedSystemConfig } from '../interfaces';

@Injectable()
export class SystemConfigCacheService {
  private readonly ttlMs = 10_000;
  private cache: {
    value: CachedSystemConfig;
    expiresAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<CachedSystemConfig> {
    const now = Date.now();

    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const config = await this.prisma.configuracoessistema.findFirst({
      orderBy: {
        atualizado_em: 'desc',
      },
      select: {
        id_configuracao_sistema: true,
        limite_seguranca_vacuo: true,
        vacuo_padrao: true,
        tolerancia_vacuo_percentual: true,
        atualizado_em: true,
      },
    });

    if (!config) {
      throw new Error('Configuração do sistema não encontrada.');
    }

    const value: CachedSystemConfig = {
      id_configuracao_sistema: config.id_configuracao_sistema,
      limite_seguranca_vacuo: config.limite_seguranca_vacuo.toNumber(),
      vacuo_padrao: config.vacuo_padrao.toNumber(),
      tolerancia_vacuo_percentual:
        config.tolerancia_vacuo_percentual.toNumber(),
      atualizado_em: config.atualizado_em,
    };

    this.cache = {
      value,
      expiresAt: now + this.ttlMs,
    };

    return value;
  }

  invalidate(): void {
    this.cache = null;
  }
}
