import {
  PROCESSO_PRECHECK_GRUPOS,
  PROCESSO_PRECHECK_VALIDADE_SEGUNDOS,
} from './processo-precheck.constants';
import {
  ProcessoPrecheckGrupo,
  ProcessoPrecheckGrupoResultado,
  ProcessoPrecheckItem,
  ProcessoPrecheckItemStatus,
  ProcessoPrecheckResultado,
  ProcessoPrecheckTipoRecurso,
} from './processo-precheck.types';

type BuildItemInput = {
  codigo: string;
  titulo: string;
  grupo: ProcessoPrecheckGrupo;
  status: ProcessoPrecheckItemStatus;
  obrigatorio?: boolean;
  bloqueante?: boolean;
  mensagem: string;
  evidencia?: string | null;
  detalhes?: Record<string, unknown> | null;
  id_recurso?: number | null;
  tipo_recurso?: ProcessoPrecheckTipoRecurso | null;
  timestamp?: Date;
};

export class ProcessoPrecheckMapper {
  static buildItem(input: BuildItemInput): ProcessoPrecheckItem {
    const obrigatorio = input.obrigatorio ?? true;

    return {
      codigo: input.codigo,
      titulo: input.titulo,
      grupo: input.grupo,
      status: input.status,
      obrigatorio,
      bloqueante: input.bloqueante ?? obrigatorio,
      mensagem: input.mensagem,
      evidencia: input.evidencia ?? null,
      detalhes: input.detalhes ?? null,
      id_recurso: input.id_recurso ?? null,
      tipo_recurso: input.tipo_recurso ?? null,
      timestamp: input.timestamp ?? new Date(),
    };
  }

  static buildResultado(input: {
    id_processo: number;
    itens: ProcessoPrecheckItem[];
    executado_em?: Date;
    avisos?: string[];
    recomendacoes?: string[];
  }): ProcessoPrecheckResultado {
    const falhas_bloqueantes = input.itens
      .filter((item) => item.bloqueante && !this.isApprovedStatus(item.status))
      .map((item) => item.mensagem);
    const bloqueado = falhas_bloqueantes.length > 0;
    const grupos = this.buildGrupos(input.itens);

    return {
      id_processo: input.id_processo,
      status_geral: bloqueado ? 'REPROVADO' : 'APROVADO',
      aprovado: !bloqueado,
      bloqueado,
      executado_em: input.executado_em ?? new Date(),
      validade_segundos: PROCESSO_PRECHECK_VALIDADE_SEGUNDOS,
      grupos,
      itens: input.itens,
      falhas_bloqueantes,
      avisos: input.avisos ?? [],
      recomendacoes: input.recomendacoes ?? [],
    };
  }

  private static buildGrupos(
    itens: ProcessoPrecheckItem[],
  ): ProcessoPrecheckGrupoResultado[] {
    return PROCESSO_PRECHECK_GRUPOS.map((grupo) => {
      const groupItems = itens.filter((item) => item.grupo === grupo);
      const total_bloqueantes = groupItems.filter(
        (item) => item.bloqueante && !this.isApprovedStatus(item.status),
      ).length;

      return {
        grupo,
        status: total_bloqueantes > 0 ? 'REPROVADO' : 'APROVADO',
        aprovado: total_bloqueantes === 0,
        total_itens: groupItems.length,
        total_bloqueantes,
      };
    });
  }

  private static isApprovedStatus(status: ProcessoPrecheckItemStatus): boolean {
    return status === 'APROVADO' || status === 'IGNORADO';
  }
}
