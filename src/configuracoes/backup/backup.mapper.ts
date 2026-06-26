import { Prisma, statusbackup } from '@prisma/client';

type BackupRecord = Prisma.backupsGetPayload<{
  select: typeof backupSelect;
}>;

export const backupSelect = {
  id_backup: true,
  id_usuario: true,
  id_usuario_restauracao: true,
  id_configuracao_sistema: true,
  id_mqtt_configuracao: true,
  id_mqtt_configuracao_historico: true,
  tipo_backup: true,
  origem_backup: true,
  status_backup: true,
  nome_arquivo: true,
  caminho_arquivo: true,
  snapshot: true,
  hash_arquivo: true,
  tamanho_bytes: true,
  content_type: true,
  storage_provider: true,
  metadados: true,
  erro: true,
  restaurado_em: true,
  criado_em: true,
  usuario_criacao: {
    select: {
      id_usuario: true,
      nome: true,
      login: true,
    },
  },
  usuario_restauracao: {
    select: {
      id_usuario: true,
      nome: true,
      login: true,
    },
  },
} satisfies Prisma.backupsSelect;

export class BackupMapper {
  static toListItem(record: BackupRecord) {
    return {
      id_backup: record.id_backup,
      tipo_backup: record.tipo_backup,
      origem_backup: record.origem_backup,
      status_backup: record.status_backup,
      nome_arquivo: record.nome_arquivo,
      hash_arquivo: record.hash_arquivo,
      tamanho_bytes: this.bigIntToString(record.tamanho_bytes),
      content_type: record.content_type,
      storage_provider: record.storage_provider,
      metadados: this.sanitizeJson(record.metadados),
      erro: record.erro,
      criado_em: record.criado_em,
      restaurado_em: record.restaurado_em,
      usuario_criacao: record.usuario_criacao,
      usuario_restauracao: record.usuario_restauracao,
    };
  }

  static toDetail(record: BackupRecord) {
    return {
      ...this.toListItem(record),
      id_usuario: record.id_usuario,
      id_usuario_restauracao: record.id_usuario_restauracao,
      id_configuracao_sistema: record.id_configuracao_sistema,
      id_mqtt_configuracao: record.id_mqtt_configuracao,
      id_mqtt_configuracao_historico: record.id_mqtt_configuracao_historico,
      caminho_arquivo: record.caminho_arquivo,
      snapshot_preview: this.sanitizeJson(record.snapshot),
    };
  }

  static toRestoreResult(record: BackupRecord, warnings: string[]) {
    return {
      id_backup: record.id_backup,
      status_backup: statusbackup.RESTAURADO,
      restaurado_em: record.restaurado_em,
      warnings,
      backup: this.toDetail(record),
    };
  }

  static sanitizeJson(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeJson(item));
    }

    if (this.isRecord(value)) {
      const sanitized: Prisma.JsonObject = {};

      for (const key of Object.keys(value)) {
        const entry = value[key];

        if (entry === undefined) {
          continue;
        }

        if (this.isSensitiveKey(key)) {
          sanitized[key] = '[OMITIDO]';
          continue;
        }

        sanitized[key] = this.sanitizeJson(entry) ?? null;
      }

      return sanitized;
    }

    return value;
  }

  private static bigIntToString(value: bigint | null): string | null {
    return value === null ? null : value.toString();
  }

  private static isRecord(value: unknown): value is Prisma.JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized.includes('senha') ||
      normalized.includes('password') ||
      normalized.includes('hash')
    );
  }
}
