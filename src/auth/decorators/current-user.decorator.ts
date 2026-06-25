import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user;
  },
);
