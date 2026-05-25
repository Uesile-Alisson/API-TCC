import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USER_ROLES_KEY } from '../decorators/user.decorator';
import { nivelacesso } from '@prisma/client';
import { AuthenticatedRequest } from '@/auth/types/authenticated-request.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<nivelacesso[]>(
      USER_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    const userRole = user.nivel_acesso.nome;

    if (!userRole) {
      throw new ForbiddenException('Nível de acesso não identificado.');
    }

    const hasPermission = requiredRoles.includes(userRole);

    if (!hasPermission) {
      throw new ForbiddenException(
        'Você não possui permissão para acessar esse recurso.',
      );
    }

    return true;
  }
}
