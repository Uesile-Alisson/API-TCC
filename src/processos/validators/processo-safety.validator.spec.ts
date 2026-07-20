import { statusgeralsistema, statusprocesso } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import type { ProcessoOperationalContext } from '../interfaces';
import { ProcessoSafetyValidator } from './processo-safety.validator';

describe('ProcessoSafetyValidator - contrato operacional MQTT', () => {
  const validator = new ProcessoSafetyValidator();

  it('bloqueia inicio quando as credenciais externas nao estao configuradas', () => {
    const reasons = validator.getStartBlockingReasons(
      makeContext({
        mqtt_credentials_configured: false,
        mqtt_credentials_verified: false,
        mqtt_connected: false,
        mqtt_operational: false,
        communication_ready: false,
      }),
    );

    expect(reasons).toContain(
      'Credenciais MQTT nao configuradas no arquivo externo seguro.',
    );
    expect(reasons).toContain('MQTT desconectado.');
    expect(reasons).toContain('Subsistema MQTT nao esta operacional.');
  });

  it('nao confunde credenciais presentes com credenciais verificadas', () => {
    const reasons = validator.getStartBlockingReasons(
      makeContext({
        mqtt_credentials_configured: true,
        mqtt_credentials_verified: false,
        mqtt_connected: true,
        mqtt_operational: false,
        communication_ready: false,
      }),
    );

    expect(reasons).toContain(
      'Credenciais MQTT ainda nao foram verificadas pelo broker nesta execucao da API.',
    );
    expect(reasons).not.toContain('MQTT desconectado.');
  });

  function makeContext(
    hardwareOverrides: Partial<
      ProcessoOperationalContext['safety']['hardware']
    >,
  ): ProcessoOperationalContext {
    return {
      status_processo: statusprocesso.CONFIGURADO,
      parada_emergencia: false,
      tanques: [],
      safety: {
        hardware: {
          mqtt_credentials_configured: true,
          mqtt_credentials_verified: true,
          mqtt_credentials_verified_at: new Date(),
          mqtt_credentials_failure: null,
          mqtt_connected: true,
          mqtt_operational: true,
          mqtt_status: null,
          esp32_online: true,
          esp32_status: statusgeralsistema.OPERACIONAL,
          last_heartbeat_at: new Date(),
          last_status_at: new Date(),
          last_reading_at: new Date(),
          communication_ready: true,
          ...hardwareOverrides,
        },
        has_critical_alarm: false,
        critical_alarms: [],
        all_tanks_ready: false,
        all_sensors_ready: false,
        all_acoplamentos_ready: false,
        can_start: false,
        blocking_reasons: [],
      },
    } as ProcessoOperationalContext;
  }
});
