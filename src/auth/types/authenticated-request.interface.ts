import { Request } from 'express';
import { Role } from '../decorators/roles.decorator';

export interface AuthenticatedRequest extends Request {
  user: {
    id_usuario: number;
    login: string;
    email: string;
    nivel_acesso: {
      nome: Role;
    };
  };
}
