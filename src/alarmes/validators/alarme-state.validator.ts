import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { statusalarme } from '@prisma/client';
import { ALARME_MESSAGES } from '../constants';

interface AlarmeStateRecord {
  id_alarme: number;
  status_alarme: statusalarme;
  resolvido_em: Date | null;
  excluido_em: Date | null;
}

@Injectable()
export class AlarmeStateValidator {
  validateExists<T extends AlarmeStateRecord | null | undefined>(
    alarme: T,
  ): asserts alarme is NonNullable<T> {
    if (!alarme) {
      throw new NotFoundException(ALARME_MESSAGES.NOT_FOUND);
    }
  }

  validateNotDeleted(alarme: AlarmeStateRecord): void {
    if (this.isDeleted(alarme)) {
      throw new ConflictException(ALARME_MESSAGES.CANNOT_RESOLVE_DELETED);
    }
  }

  validateNotResolved(alarme: AlarmeStateRecord): void {
    if (this.isResolved(alarme)) {
      throw new ConflictException(ALARME_MESSAGES.ALREADY_RESOLVED);
    }
  }

  validateCanResolve(
    alarme: AlarmeStateRecord | null | undefined,
  ): asserts alarme is AlarmeStateRecord {
    this.validateExists(alarme);
    this.validateNotDeleted(alarme);
    this.validateNotResolved(alarme);
  }

  isResolved(alarme: AlarmeStateRecord): boolean {
    return (
      alarme.status_alarme === statusalarme.RESOLVIDO ||
      alarme.resolvido_em !== null
    );
  }

  isDeleted(alarme: AlarmeStateRecord): boolean {
    return alarme.excluido_em !== null;
  }
}
