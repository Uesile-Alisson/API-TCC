import { describe, expect, it } from '@jest/globals';
import { origembackup, statusbackup, tipobackup } from '@prisma/client';
import { BackupMapper } from '../backup.mapper';

describe('BackupMapper', () => {
  it('converte BigInt para string na listagem e mantem campos seguros', () => {
    const result = BackupMapper.toListItem(makeBackupRecord());

    expect(result).toMatchObject({
      id_backup: 10,
      tipo_backup: tipobackup.MQTT,
      origem_backup: origembackup.MANUAL,
      status_backup: statusbackup.GERADO,
      tamanho_bytes: '2048',
      storage_provider: 'POSTGRES_JSON',
    });
    expect(JSON.stringify(result)).not.toContain('senha-mqtt');
  });

  it('retorna snapshot_preview sanitizado no detalhe', () => {
    const result = BackupMapper.toDetail(
      makeBackupRecord({
        snapshot: {
          mqtt: {
            configuracao_mqtt: {
              broker_url: 'mqtt://localhost',
              senha_mqtt_hash: 'hash-secreto',
              senha: 'senha-mqtt',
              nested: {
                password: 'secret',
              },
            },
          },
        },
      }),
    );
    const serialized = JSON.stringify(result);

    expect(result.snapshot_preview).toMatchObject({
      mqtt: {
        configuracao_mqtt: {
          broker_url: 'mqtt://localhost',
          senha_mqtt_hash: '[OMITIDO]',
          senha: '[OMITIDO]',
          nested: {
            password: '[OMITIDO]',
          },
        },
      },
    });
    expect(serialized).not.toContain('hash-secreto');
    expect(serialized).not.toContain('senha-mqtt');
    expect(serialized).not.toContain('secret');
  });

  it('nao quebra com metadados null e usuarios ausentes', () => {
    const result = BackupMapper.toListItem(
      makeBackupRecord({
        metadados: null,
        usuario_criacao: null,
        usuario_restauracao: null,
      }),
    );

    expect(result.metadados).toBeNull();
    expect(result.usuario_criacao).toBeNull();
    expect(result.usuario_restauracao).toBeNull();
  });
});

function makeBackupRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_backup: 10,
    id_usuario: 1,
    id_usuario_restauracao: null,
    id_configuracao_sistema: null,
    id_mqtt_configuracao: 3,
    id_mqtt_configuracao_historico: null,
    tipo_backup: tipobackup.MQTT,
    origem_backup: origembackup.MANUAL,
    status_backup: statusbackup.GERADO,
    nome_arquivo: 'tsea-backup-mqtt.json',
    caminho_arquivo: null,
    snapshot: {
      mqtt: {
        configuracao_mqtt: {
          broker_url: 'mqtt://localhost',
          senha_mqtt_omitida: true,
        },
      },
    },
    hash_arquivo: 'hash',
    tamanho_bytes: BigInt(2048),
    content_type: 'application/json',
    storage_provider: 'POSTGRES_JSON',
    metadados: null,
    erro: null,
    restaurado_em: null,
    criado_em: new Date('2026-06-26T10:00:00Z'),
    usuario_criacao: {
      id_usuario: 1,
      nome: 'Admin',
      login: 'admin',
    },
    usuario_restauracao: null,
    ...overrides,
  } as Parameters<typeof BackupMapper.toListItem>[0];
}
