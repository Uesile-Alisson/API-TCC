import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { nivelacesso } from '@prisma/client';
import {
  HISTORICO_ALLOWED_ROLES,
  HISTORICO_OPERATOR_BLOCKED_FILTERS,
} from '../constants';
import type {
  HistoricoDashboardQueryDto,
  ListHistoricoProcessosQueryDto,
} from '../dto';

export type HistoricoUserRole = nivelacesso | (string & {});

export interface HistoricoCurrentUserLike {
  id_usuario?: number;
  nivel_acesso?: HistoricoUserRole;
  role?: HistoricoUserRole;
  perfil?: HistoricoUserRole;
}

@Injectable()
export class HistoricoPermissionValidator {
  validateCanUseListFilters(params: {
    user: HistoricoCurrentUserLike;
    query: ListHistoricoProcessosQueryDto;
  }): void {
    const role = this.validateKnownHistoricoRole(params.user);

    if (this.isOperator(role) && this.hasRestrictedFilter(params.query)) {
      throw new ForbiddenException(
        'O filtro id_usuario e restrito para o perfil OPERADOR.',
      );
    }
  }

  validateCanUseDashboardFilters(params: {
    user: HistoricoCurrentUserLike;
    query: HistoricoDashboardQueryDto;
  }): void {
    this.validateKnownHistoricoRole(params.user);
  }

  validateCanViewHistoricalDetails(user: HistoricoCurrentUserLike): void {
    this.validateKnownHistoricoRole(user);
  }

  validateCanViewHistoricalReportMetadata(
    user: HistoricoCurrentUserLike,
  ): void {
    this.validateKnownHistoricoRole(user);
  }

  validateReportGenerationIsNotHistoricoResponsibility(): never {
    throw new BadRequestException(
      'A geração de relatórios pertence ao módulo Relatórios, não ao módulo Histórico.',
    );
  }

  validateKnownHistoricoRole(
    user: HistoricoCurrentUserLike,
  ): HistoricoUserRole {
    const normalizedRole = this.normalizeRole(this.getUserRole(user));

    if (!normalizedRole || !this.isAllowedHistoricoRole(normalizedRole)) {
      throw new ForbiddenException(
        'Perfil de usuario ausente ou desconhecido para o Historico.',
      );
    }

    return normalizedRole;
  }

  private getUserRole(
    user: HistoricoCurrentUserLike,
  ): HistoricoUserRole | null {
    return user.nivel_acesso ?? user.role ?? user.perfil ?? null;
  }

  private normalizeRole(
    role: HistoricoUserRole | null | undefined,
  ): string | null {
    if (role === null || role === undefined) {
      return null;
    }

    const normalized = String(role).trim().toUpperCase();

    return normalized.length > 0 ? normalized : null;
  }

  private isOperator(role: string): boolean {
    return role === nivelacesso.OPERADOR;
  }

  private isTechnician(role: string): boolean {
    return role === nivelacesso.TECNICO;
  }

  private isAdmin(role: string): boolean {
    return role === nivelacesso.ADMINISTRADOR;
  }

  private isAllowedHistoricoRole(role: string): boolean {
    return (
      this.isOperator(role) ||
      this.isTechnician(role) ||
      this.isAdmin(role) ||
      HISTORICO_ALLOWED_ROLES.some((allowedRole) => allowedRole === role)
    );
  }

  private hasRestrictedFilter(query: ListHistoricoProcessosQueryDto): boolean {
    return HISTORICO_OPERATOR_BLOCKED_FILTERS.some(
      (filter) => query[filter] !== undefined,
    );
  }
}
