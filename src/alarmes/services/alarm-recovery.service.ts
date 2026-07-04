import { Injectable } from '@nestjs/common';
import {
  origemalarme,
  origemlogoperacional,
  resultadotentativarecuperacaoalarme,
  tipoalarme,
} from '@prisma/client';
import { AlarmeLogService } from '../logs';
import { AlarmeDetailsRecord, AlarmesRepository } from '../repositories';

export interface AlarmRecoveryResult {
  attempted: boolean;
  resultado: resultadotentativarecuperacaoalarme;
  reason: string;
}

@Injectable()
export class AlarmRecoveryService {
  constructor(
    private readonly alarmesRepository: AlarmesRepository,
    private readonly alarmeLogService: AlarmeLogService,
  ) {}

  async tryRecovery(alarme: AlarmeDetailsRecord): Promise<AlarmRecoveryResult> {
    const recovery = this.classifyRecovery(alarme);

    await this.alarmesRepository.registerRecoveryAttempt(alarme.id_alarme, {
      tipo_recuperacao: recovery.tipo_recuperacao,
      resultado: recovery.resultado,
      descricao: recovery.reason,
      origem: origemlogoperacional.SISTEMA,
    });

    await this.alarmeLogService.logAction({
      id_alarme: alarme.id_alarme,
      id_processo: alarme.id_processo,
      acao: 'ALARME_RECUPERACAO_TENTADA',
      descricao: recovery.reason,
      sucesso: recovery.resultado !== resultadotentativarecuperacaoalarme.FALHA,
    });

    return {
      attempted: true,
      resultado: recovery.resultado,
      reason: recovery.reason,
    };
  }

  private classifyRecovery(alarme: AlarmeDetailsRecord): {
    tipo_recuperacao: string;
    resultado: resultadotentativarecuperacaoalarme;
    reason: string;
  } {
    if (
      alarme.tipo_alarme === tipoalarme.MQTT ||
      alarme.origem_alarme === origemalarme.MQTT
    ) {
      return {
        tipo_recuperacao: 'MQTT_RECONNECT',
        resultado: resultadotentativarecuperacaoalarme.IGNORADA,
        reason:
          'Tentativa registrada: reconexao MQTT depende do servico de conexao ativo.',
      };
    }

    return {
      tipo_recuperacao: 'AGUARDAR_EVIDENCIA_TECNICA',
      resultado: resultadotentativarecuperacaoalarme.IGNORADA,
      reason:
        'Alarme fisico nao e resolvido automaticamente; aguardando evidencia tecnica.',
    };
  }
}
