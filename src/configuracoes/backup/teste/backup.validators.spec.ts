import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { statusbackup, tipobackup } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BackupQueryDto } from '../dto/backup-query.dto';
import { CreateBackupDto } from '../dto/create-backup.dto';
import { RestoreBackupDto } from '../dto/restore-backup.dto';
import {
  assertBackupStatus,
  canRestoreStatus,
  isBackupStatus,
} from '../validators/backup-status.validator';
import {
  assertBackupType,
  isBackupType,
  isMqttBackupType,
  isSystemBackupType,
} from '../validators/backup-type.validator';
import { validateBackupDateRange } from '../validators/backup-date-range.validator';

describe('Backup validators', () => {
  it('aceita tipos validos e rejeita tipo invalido', () => {
    expect(isBackupType(tipobackup.SISTEMA)).toBe(true);
    expect(isBackupType(tipobackup.MQTT)).toBe(true);
    expect(isBackupType(tipobackup.COMPLETO)).toBe(true);
    expect(isBackupType('INVALIDO')).toBe(false);
    expect(() => assertBackupType('INVALIDO')).toThrow(BadRequestException);
  });

  it('classifica tipos que contem sistema e MQTT', () => {
    expect(isSystemBackupType(tipobackup.SISTEMA)).toBe(true);
    expect(isSystemBackupType(tipobackup.COMPLETO)).toBe(true);
    expect(isSystemBackupType(tipobackup.MQTT)).toBe(false);
    expect(isMqttBackupType(tipobackup.MQTT)).toBe(true);
    expect(isMqttBackupType(tipobackup.COMPLETO)).toBe(true);
    expect(isMqttBackupType(tipobackup.SISTEMA)).toBe(false);
  });

  it('aceita status validos e bloqueia status invalidos para restore', () => {
    expect(isBackupStatus(statusbackup.GERADO)).toBe(true);
    expect(isBackupStatus('INVALIDO_FAKE')).toBe(false);
    expect(() => assertBackupStatus('INVALIDO_FAKE')).toThrow(
      BadRequestException,
    );
    expect(canRestoreStatus(statusbackup.GERADO)).toBe(true);
    expect(canRestoreStatus(statusbackup.RESTAURADO)).toBe(true);
    expect(canRestoreStatus(statusbackup.INVALIDO)).toBe(false);
    expect(canRestoreStatus(statusbackup.FALHA_GERACAO)).toBe(false);
    expect(canRestoreStatus(statusbackup.FALHA_RESTAURACAO)).toBe(false);
  });

  it('valida intervalo de datas', () => {
    const valid = validateBackupDateRange({
      data_inicio: '2026-06-01T00:00:00.000Z',
      data_fim: '2026-06-26T23:59:59.999Z',
    });

    expect(valid.data_inicio).toBeInstanceOf(Date);
    expect(valid.data_fim).toBeInstanceOf(Date);
    expect(() =>
      validateBackupDateRange({
        data_inicio: '2026-06-27T00:00:00.000Z',
        data_fim: '2026-06-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() => validateBackupDateRange({ data_inicio: 'data-ruim' })).toThrow(
      BadRequestException,
    );
  });
});

describe('Backup DTOs', () => {
  it('CreateBackupDto exige tipo valido e limita observacao', async () => {
    const valid = plainToInstance(CreateBackupDto, {
      tipo_backup: tipobackup.SISTEMA,
      observacao: 'Backup manual',
    });
    const invalid = plainToInstance(CreateBackupDto, {
      tipo_backup: 'INVALIDO',
      observacao: 'x'.repeat(501),
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(2);
  });

  it('RestoreBackupDto exige confirmacao e limita o motivo', async () => {
    const valid = plainToInstance(RestoreBackupDto, {
      confirmar_restauracao: true,
      motivo: 'Restauracao controlada',
    });
    const invalid = plainToInstance(RestoreBackupDto, {
      motivo: 'x'.repeat(501),
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(2);
  });

  it('BackupQueryDto aceita filtros validos e rejeita filtros invalidos', async () => {
    const valid = plainToInstance(BackupQueryDto, {
      tipo_backup: tipobackup.COMPLETO,
      status_backup: statusbackup.GERADO,
      data_inicio: '2026-06-01T00:00:00.000Z',
      page: 1,
      limit: 20,
    });
    const invalid = plainToInstance(BackupQueryDto, {
      tipo_backup: 'RUIM',
      status_backup: 'RUIM',
      data_inicio: 'data-ruim',
      page: 0,
      limit: 101,
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(5);
  });
});
