import { SetMetadata } from '@nestjs/common';
import { nivelacesso } from '@prisma/client';

export const USER_ROLES_KEY = 'user_roles';
export const UserRoles = (...roles: nivelacesso[]) =>
  SetMetadata(USER_ROLES_KEY, roles);
