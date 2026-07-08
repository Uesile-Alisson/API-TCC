import { Injectable } from '@nestjs/common';
import {
  motivoresolucaoalarme,
  severidadealarme,
  statusalarme,
  statusprocesso,
} from '@prisma/client';

export interface AlarmResolutionPolicyResult {
  allowed: boolean;
  reason: string;
  motivo_resolucao: motivoresolucaoalarme | null;
}

export interface AlarmResolutionPolicySubject {
  severidade: severidadealarme;
  status_alarme: statusalarme;
  bloqueante: boolean;
  requer_intervencao: boolean;
  recuperacao_automatica: boolean;
  processos?: {
    status_processo: statusprocesso;
  } | null;
}

@Injectable()
export class AlarmResolutionPolicyService {
  decide(alarme: AlarmResolutionPolicySubject): AlarmResolutionPolicyResult {
    const processStatus = alarme.processos?.status_processo ?? null;

    if (alarme.severidade === severidadealarme.INFO) {
      return {
        allowed: false,
        reason: 'Evento informativo nao exige resolucao operacional de alarme.',
        motivo_resolucao: null,
      };
    }

    if (alarme.status_alarme === statusalarme.NORMALIZADO) {
      return {
        allowed: true,
        reason: 'Alarme normalizado tecnicamente pode ser resolvido.',
        motivo_resolucao:
          motivoresolucaoalarme.NORMALIZADO_CONFIRMADO_PELO_USUARIO,
      };
    }

    if (alarme.status_alarme !== statusalarme.ATIVO) {
      return {
        allowed: false,
        reason: 'A causa tecnica ainda nao foi normalizada pelo sistema.',
        motivo_resolucao: null,
      };
    }

    if (this.isOperationalProcess(processStatus)) {
      return {
        allowed: false,
        reason:
          'Alarme ativo nao pode ser resolvido durante processo em execucao/pausado sem normalizacao tecnica.',
        motivo_resolucao: null,
      };
    }

    if (processStatus === statusprocesso.CONFIGURADO) {
      return {
        allowed: false,
        reason:
          'Alarme ativo em processo configurado exige normalizacao tecnica antes da resolucao.',
        motivo_resolucao: null,
      };
    }

    if (processStatus && this.isDocumentalClosureProcess(processStatus)) {
      return {
        allowed: true,
        reason: 'Alarme pode receber fechamento documental fora de execucao.',
        motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
      };
    }

    if (!processStatus) {
      if (this.requiresTechnicalNormalization(alarme)) {
        return {
          allowed: false,
          reason:
            'Alarme ativo sem processo e com risco tecnico exige normalizacao antes da resolucao.',
          motivo_resolucao: null,
        };
      }

      return {
        allowed: true,
        reason:
          'Alarme informativo sem processo pode receber fechamento documental.',
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
      statusprocesso.CONCLUIDO,
      statusprocesso.INTERROMPIDO,
      statusprocesso.FALHA,
    ];

    return documentalStatuses.includes(status);
  }

  private requiresTechnicalNormalization(
    alarme: AlarmResolutionPolicySubject,
  ): boolean {
    return (
      alarme.bloqueante ||
      alarme.requer_intervencao ||
      alarme.recuperacao_automatica
    );
  }
}
