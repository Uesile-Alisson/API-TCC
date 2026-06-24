import { ForbiddenException, Injectable } from '@nestjs/common';
import { nivelacesso } from '@prisma/client';

import { RELATORIO_MESSAGES } from '../constants';

export interface ValidateRestrictedFilterPermissionParams {
  nivel_acesso: nivelacesso;
  filter: string;
}

const KNOWN_ROLES = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

const GENERATION_AND_DOWNLOAD_ROLES = [
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

@Injectable()
export class RelatorioPermissionValidator {
  validateCanList(nivel_acesso: nivelacesso): void {
    this.assertKnownRole(nivel_acesso);
  }

  validateCanView(nivel_acesso: nivelacesso): void {
    this.assertKnownRole(nivel_acesso);
  }

  validateCanPreview(nivel_acesso: nivelacesso): void {
    this.assertKnownRole(nivel_acesso);
  }

  validateCanDownload(nivel_acesso: nivelacesso): void {
    this.assertKnownRole(nivel_acesso);

    if (!this.canGenerateOrDownload(nivel_acesso)) {
      throw new ForbiddenException(
        RELATORIO_MESSAGES.PERMISSION.FORBIDDEN_DOWNLOAD,
      );
    }
  }

  validateCanGenerate(nivel_acesso: nivelacesso): void {
    this.assertKnownRole(nivel_acesso);

    if (!this.canGenerateOrDownload(nivel_acesso)) {
      throw new ForbiddenException(
        RELATORIO_MESSAGES.PERMISSION.FORBIDDEN_GENERATE,
      );
    }
  }

  validateCanGenerateProcessReport(nivel_acesso: nivelacesso): void {
    this.validateCanGenerate(nivel_acesso);
  }

  validateCanGenerateAlarmReport(nivel_acesso: nivelacesso): void {
    this.validateCanGenerate(nivel_acesso);
  }

  validateCanUseRestrictedFilter(
    params: ValidateRestrictedFilterPermissionParams,
  ): void {
    this.assertKnownRole(params.nivel_acesso);

    if (
      params.filter === 'id_usuario' &&
      params.nivel_acesso === nivelacesso.OPERADOR
    ) {
      throw new ForbiddenException(
        RELATORIO_MESSAGES.PERMISSION.FORBIDDEN_FILTER_USER,
      );
    }
  }

  assertKnownRole(nivel_acesso: nivelacesso | null | undefined): void {
    const isKnownRole = KNOWN_ROLES.some((role) => role === nivel_acesso);

    if (!isKnownRole) {
      throw new ForbiddenException(RELATORIO_MESSAGES.PERMISSION.UNKNOWN_ROLE);
    }
  }

  private canGenerateOrDownload(nivel_acesso: nivelacesso): boolean {
    return GENERATION_AND_DOWNLOAD_ROLES.some((role) => role === nivel_acesso);
  }
}
