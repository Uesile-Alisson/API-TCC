import { BadRequestException } from '@nestjs/common';
import { statusbackup } from '@prisma/client';

const BACKUP_STATUSES = Object.values(statusbackup);

export function isBackupStatus(value: unknown): value is statusbackup {
  return (
    typeof value === 'string' && BACKUP_STATUSES.includes(value as statusbackup)
  );
}

export function assertBackupStatus(
  value: unknown,
): asserts value is statusbackup {
  if (!isBackupStatus(value)) {
    throw new BadRequestException('status_backup informado e invalido.');
  }
}

export function canRestoreStatus(status: statusbackup): boolean {
  return status === statusbackup.GERADO || status === statusbackup.RESTAURADO;
}
