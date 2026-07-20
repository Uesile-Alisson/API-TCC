import {
  modooperacaoauxiliar,
  statusauxiliotanque,
  statusbomba,
  statussubsistemaauxiliar,
  StatusAcoplamentoMangueira,
  StatusValvula,
} from '@prisma/client';

export interface ProcessoAuxiliarControlHolder {
  id_usuario: number;
  nome: string;
  login: string;
  assumido_em: Date | null;
  expira_em: Date | null;
}

export interface ProcessoAuxiliarPumpState {
  id_bomba: number;
  nome: string;
  codigo_hardware: string | null;
  status_configuracao: statusbomba;
  ligada_hardware: boolean | null;
  disponivel_hardware: boolean | null;
  ultimo_status_hardware_em: Date | null;
  controle: ProcessoAuxiliarControlHolder | null;
}

export interface ProcessoAuxiliarValveState {
  id_valvula: number;
  nome: string;
  codigo_hardware: string | null;
  status_valvula: StatusValvula;
  ativa: boolean;
  ultimo_acionamento: Date | null;
  controle: ProcessoAuxiliarControlHolder | null;
}

export interface ProcessoAuxiliarTankState {
  id_processo_tanque_auxiliar: number;
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_auxilio: statusauxiliotanque;
  prioridade: number;
  posicao_fila: number | null;
  solicitado_em: Date | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  versao: number;
  motivo_bloqueio: string | null;
  ultimo_erro: string | null;
  evidencias: {
    avaliacao_iniciada_em: Date | null;
    avaliacao_finalizada_em: Date | null;
    vacuo_antes: number | null;
    tendencia_antes: number | null;
    vacuo_durante: number | null;
    tendencia_durante: number | null;
    vacuo_apos: number | null;
    tendencia_apos: number | null;
    melhoria_observada: number | null;
    melhoria_minima_esperada: number | null;
    eficacia_confirmada: boolean | null;
    motivo: string | null;
  };
  status_acoplamento: StatusAcoplamentoMangueira | null;
  quantidade_valvulas_auxiliares: number;
  valvula_auxiliar: ProcessoAuxiliarValveState | null;
}

export interface ProcessoAuxiliarCurrentTank {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
}

export interface ProcessoAuxiliarState {
  id_processo: number;
  modo_operacao_auxiliar: modooperacaoauxiliar;
  status_subsistema: statussubsistemaauxiliar;
  versao: number;
  tanque_em_atendimento: ProcessoAuxiliarCurrentTank | null;
  bomba_auxiliar: ProcessoAuxiliarPumpState | null;
  tanques: ProcessoAuxiliarTankState[];
  motivo_bloqueio: string | null;
  ultimo_erro: string | null;
  atualizado_em: Date;
  snapshot_at: Date;
}
