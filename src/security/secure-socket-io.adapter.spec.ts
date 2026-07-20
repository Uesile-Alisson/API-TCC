import { describe, expect, it, jest } from '@jest/globals';
import type { IncomingMessage } from 'node:http';
import type { ServerOptions } from 'socket.io';
import {
  buildSecureSocketServerOptions,
  DEFAULT_CLIENT_ORIGINS,
  parseAllowedClientOrigins,
} from './secure-socket-io.adapter';

describe('SecureSocketIoAdapter', () => {
  it('usa somente as origens locais explicitas por padrao', () => {
    expect(parseAllowedClientOrigins(undefined)).toEqual(
      DEFAULT_CLIENT_ORIGINS,
    );
  });

  it('normaliza, separa e remove origens duplicadas da configuracao', () => {
    expect(
      parseAllowedClientOrigins(
        ' https://app.example.com/,http://localhost:5173,https://app.example.com ',
      ),
    ).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it.each([
    '*',
    'https://app.example.com/path',
    'ftp://app.example.com',
    'app.example.com',
  ])('recusa configuracao de origem insegura ou invalida: %s', (origin) => {
    expect(() => parseAllowedClientOrigins(origin)).toThrow();
  });

  it('permite handshake apenas quando a origem esta na allowlist', () => {
    const options = buildSecureSocketServerOptions(undefined, [
      'https://app.example.com',
    ]);

    expect(runAllowRequest(options, 'https://app.example.com')).toBe(true);
    expect(runAllowRequest(options, 'https://attacker.example.com')).toBe(
      false,
    );
    expect(runAllowRequest(options, undefined)).toBe(false);
    expect(options.cors).toMatchObject({
      origin: ['https://app.example.com'],
      credentials: true,
    });
  });

  it('nao permite que recuperacao de conexao ignore a autenticacao', () => {
    const options = buildSecureSocketServerOptions(
      {
        connectionStateRecovery: {
          maxDisconnectionDuration: 60_000,
          skipMiddlewares: true,
        },
      },
      ['https://app.example.com'],
    );

    expect(options.connectionStateRecovery).toEqual({
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false,
    });
  });

  it('preserva uma verificacao allowRequest adicional ja configurada', () => {
    const previousAllowRequest = jest.fn(
      (
        _request: IncomingMessage,
        callback: (error: string | null | undefined, allowed: boolean) => void,
      ) => callback(null, false),
    );
    const options = buildSecureSocketServerOptions(
      { allowRequest: previousAllowRequest },
      ['https://app.example.com'],
    );

    expect(runAllowRequest(options, 'https://app.example.com')).toBe(false);
    expect(previousAllowRequest).toHaveBeenCalledTimes(1);
  });
});

function runAllowRequest(
  options: Partial<ServerOptions>,
  origin: string | undefined,
): boolean | undefined {
  let result: boolean | undefined;
  const request = {
    headers: origin ? { origin } : {},
  } as IncomingMessage;

  options.allowRequest?.(request, (_error, allowed) => {
    result = allowed;
  });

  return result;
}
