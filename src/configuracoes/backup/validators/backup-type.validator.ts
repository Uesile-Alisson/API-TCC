import { BadRequestException } from '@nestjs/common';
import { tipobackup } from '@prisma/client';

const BACKUP_TYPES = Object.values(tipobackup);

export function isBackupType(value: unknown): value is tipobackup {
  return (
    typeof value === 'string' && BACKUP_TYPES.includes(value as tipobackup)
  );
}

export function assertBackupType(value: unknown): asserts value is tipobackup {
  if (!isBackupType(value)) {
    throw new BadRequestException('tipo_backup informado e invalido.');
  }
}

export function isMqttBackupType(tipo_backup: tipobackup): boolean {
  return tipo_backup === tipobackup.MQTT || tipo_backup === tipobackup.COMPLETO;
}

export function isSystemBackupType(tipo_backup: tipobackup): boolean {
  return (
    tipo_backup === tipobackup.SISTEMA || tipo_backup === tipobackup.COMPLETO
  );
}
