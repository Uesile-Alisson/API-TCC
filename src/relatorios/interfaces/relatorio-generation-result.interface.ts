import type { formatorelatorio } from '@prisma/client';

import type { RelatorioResponse } from './relatorio-response.interface';

export interface RelatorioGenerationResult {
  relatorios: RelatorioResponse[];
  total_gerados: number;
  formatos_gerados: formatorelatorio[];
}

export interface SingleRelatorioGenerationResult {
  relatorio: RelatorioResponse;
  formato_gerado: formatorelatorio;
}

export interface RelatorioGenerationContext {
  id_usuario: number;
  nome_usuario: string;
  observacao: string | null;
  gerado_em: Date;
}
