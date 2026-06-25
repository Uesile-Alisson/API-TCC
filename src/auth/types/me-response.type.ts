import type { Role } from '../decorators/roles.decorator';

export interface MeResponse {
  id_usuario: number;
  nome: string;
  login: string;
  email: string | null;
  id_nivel_acesso: number;
  nivel_acesso: Role;
  primeiro_acesso: boolean;
}
