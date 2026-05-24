import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type AuthenticatedUser = {
  id_usuario: number;
  login: string;
  nome: string;
  id_nivel_acesso: number;
  nivel_acesso: 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR';
  primeiro_acesso: boolean;
};

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
