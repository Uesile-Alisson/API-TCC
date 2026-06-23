import type { statusprocesso } from '@prisma/client';
import type { HistoricoAlarmesResumo } from './historico-alarme-summary.interface';
import type { HistoricoDiagnostico } from './historico-diagnostico.interface';
import type { HistoricoEventosResumo } from './historico-evento-summary.interface';
import type { HistoricoUsuarioResumo } from './historico-processo-list-item.interface';
import type { HistoricoRelatorioSummary } from './historico-relatorio-summary.interface';
import type { HistoricoTanqueSummary } from './historico-tanque-summary.interface';

export interface HistoricoProcessoDetalheBase {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  usuario_responsavel: HistoricoUsuarioResumo | null;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  pausado_em: Date | null;
  retomado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
}

export interface HistoricoProcessoDetails {
  processo: HistoricoProcessoDetalheBase;
  tanques: HistoricoTanqueSummary[];
  resumo_alarmes: HistoricoAlarmesResumo;
  resumo_eventos: HistoricoEventosResumo;
  relatorios: HistoricoRelatorioSummary[];
  diagnostico: HistoricoDiagnostico;
}
