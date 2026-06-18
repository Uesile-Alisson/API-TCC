import { nivelacesso } from '@prisma/client';

export interface CurrentUserPayload {
  sub: number;
  login: string;
  id_nivel_acesso: number;
  nivel_acesso: nivelacesso;
}
