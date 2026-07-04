import { Injectable } from '@nestjs/common';
import {
  motivoresolucaoalarme,
  statusalarme,
  statusprocesso,
} from '@prisma/client';
import type { AlarmeDetailsRecord } from '../repositories';

export interface AlarmResolutionPolicyResult {
  allowed: boolean;
  reason: string;
  motivo_resolucao: motivoresolucaoalarme | null;
}

@Injectable()
export class AlarmResolutionPolicyService {
  decide(alarme: AlarmeDetailsRecord): AlarmResolutionPolicyResult {
    const processStatus = alarme.processos?.status_processo ?? null;

    if (
      this.isOperationalProcess(processStatus) &&
      alarme.status_alarme === statusalarme.ATIVO
    ) {
      return {
        allowed: false,
        reason:
          'Alarme ativo nao pode ser resolvido durante processo em execucao/pausado sem normalizacao tecnica.',
        motivo_resolucao: null,
      };
    }

    if (
      this.isOperationalProcess(processStatus) &&
      alarme.status_alarme === statusalarme.NORMALIZADO
    ) {
      return {
        allowed: true,
        reason: 'Alarme normalizado tecnicamente pode ser resolvido.',
        motivo_resolucao:
          motivoresolucaoalarme.NORMALIZADO_CONFIRMADO_PELO_USUARIO,
      };
    }

    if (!processStatus || this.isDocumentalClosureProcess(processStatus)) {
      return {
        allowed: true,
        reason: 'Alarme pode receber fechamento documental fora de execucao.',
        motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
      };
    }

    return {
      allowed: false,
      reason: 'A causa tecnica ainda nao foi normalizada pelo sistema.',
      motivo_resolucao: null,
    };
  }

  private isOperationalProcess(status: statusprocesso | null): boolean {
    return (
      status === statusprocesso.EM_EXECUCAO || status === statusprocesso.PAUSADO
    );
  }

  private isDocumentalClosureProcess(status: statusprocesso): boolean {
    const documentalStatuses: statusprocesso[] = [
      statusprocesso.CONFIGURADO,
      statusprocesso.CONCLUIDO,
      statusprocesso.INTERROMPIDO,
      statusprocesso.FALHA,
    ];

    return documentalStatuses.includes(status);
  }
}
