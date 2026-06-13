import { randomUUID } from 'crypto';
import { CommandName } from './interfaces/command-name.interface';
import { CommandOptions } from './interfaces/command-options.interface';
import {
  EmptyCommandParams,
  CommandParams,
} from './interfaces/command-params.interface';
import { CommandPayload } from './interfaces/command-payload.interface';

export class CommandPayloadBuilder {
  private static readonly CORRELATION_ID_PREFIX = 'cmd';

  static build<TParams extends CommandParams>(
    comando: CommandName,
    parametros: TParams,
    options?: CommandOptions,
  ): CommandPayload<TParams> {
    return {
      comando,
      correlation_id: this.resolveCorrelationId(comando, options),
      enviado_em: new Date(),
      solicitado_por: this.resolveSolicitadoPor(options),
      motivo: this.resolveMotivo(options),
      parametros,
    };
  }

  static buildWithoutParams(
    comando: CommandName,
    options?: CommandOptions,
  ): CommandPayload<EmptyCommandParams> {
    return this.build(comando, {}, options);
  }

  private static resolveCorrelationId(
    comando: CommandName,
    options?: CommandOptions,
  ): string {
    const customCorrelationId = options?.correlation_id?.trim();

    if (customCorrelationId) {
      return customCorrelationId;
    }

    return this.generateCorrelationId(comando);
  }

  private static generateCorrelationId(comando: CommandName): string {
    const normalizedComando = this.normalizeCommandName(comando);

    return `${this.CORRELATION_ID_PREFIX}_${normalizedComando}_${Date.now()}_${randomUUID()}`;
  }

  private static normalizeCommandName(comando: CommandName): string {
    return comando.toLowerCase().replaceAll('_', '-');
  }

  private static resolveSolicitadoPor(options?: CommandOptions): number | null {
    return options?.solicitado_por ?? null;
  }

  private static resolveMotivo(options?: CommandOptions): string | null {
    const motivo = options?.motivo?.trim();

    if (!motivo) {
      return null;
    }

    return motivo;
  }
}
