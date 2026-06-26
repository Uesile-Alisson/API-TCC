import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { expect } from '@jest/globals';

type ControllerMethod = (...args: unknown[]) => unknown;
type ControllerClass = {
  prototype: object;
};

export function getControllerMethod(
  controller: ControllerClass,
  methodName: string,
): ControllerMethod {
  const descriptor = Object.getOwnPropertyDescriptor(
    controller.prototype,
    methodName,
  );
  const value: unknown = descriptor?.value;

  if (typeof value !== 'function') {
    throw new Error(`Metodo ${methodName} nao encontrado no controller.`);
  }

  return value as ControllerMethod;
}

export function expectConfiguracoesControllerSecurity(
  controller: ControllerClass,
  methodNames: string[],
): void {
  const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, controller);
  expect(guards).toEqual([JwtAuthGuard, RolesGuard]);

  for (const methodName of methodNames) {
    const roles: unknown = Reflect.getMetadata(
      ROLES_KEY,
      getControllerMethod(controller, methodName),
    );
    expect(roles).toEqual(['TECNICO', 'ADMINISTRADOR']);
  }
}
