import { statusprocesso } from '@prisma/client';

export interface ProcessoActionResult<TData = unknown> {
  success: boolean;
  message: string;
  id_processo: number;
  status_processo: statusprocesso;
  data?: TData;
}
