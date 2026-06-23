import type { formatorelatorio, tiporelatorio } from '@prisma/client';

export interface HistoricoRelatorioSummary {
  id_relatorio: number;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  titulo: string;
  descricao: string | null;
  nome_arquivo: string;
  tamanho_bytes: number | null;
  gerado_em: Date;
}
