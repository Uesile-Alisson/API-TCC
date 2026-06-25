import type { Role } from '../decorators/roles.decorator';

export interface AuthenticatedUser {
  id_usuario: number;
  login: string;
  nome: string;
  email: string | null;
  id_nivel_acesso?: number;
  nivel_acesso: {
    nome: Role;
  };
  primeiro_acesso: boolean;
}
