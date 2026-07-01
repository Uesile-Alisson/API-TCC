import { Injectable, Logger } from '@nestjs/common';
import { StatusValvula } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ValvulaHardwareStatusInput {
  id_valvula: number;
  status_valvula: StatusValvula;
  ack: boolean;
  falha: boolean;
}

interface ValvulaStatusResult {
  id_valvula: number;
  status_valvula: StatusValvula;
  ack: boolean;
  falha: boolean;
  atualizado: boolean;
  motivo?: string;
}

@Injectable()
export class ValvulaHardwareStatusService {
  private readonly logger = new Logger(ValvulaHardwareStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processStatusPayload(
    valvulas: Record<string, unknown> | undefined,
    statusAt: Date,
  ): Promise<ValvulaStatusResult[]> {
    if (!valvulas || Object.keys(valvulas).length === 0) {
      return [];
    }

    const results: ValvulaStatusResult[] = [];

    for (const [key, value] of Object.entries(valvulas)) {
      const parsed = this.parseValveStatus(key, value);

      if (!parsed) {
        results.push({
          id_valvula: Number(key),
          status_valvula: StatusValvula.DESCONHECIDA,
          ack: false,
          falha: true,
          atualizado: false,
          motivo: 'Payload de valvula invalido.',
        });
        continue;
      }

      results.push(await this.updateValveStatus(parsed, statusAt));
    }

    return results;
  }

  private parseValveStatus(
    key: string,
    value: unknown,
  ): ValvulaHardwareStatusInput | null {
    if (!this.isRecord(value)) {
      this.logger.warn(`Status de valvula ignorado. Entrada ${key} invalida.`);
      return null;
    }

    const idValvula = Number(value.id_valvula ?? key);

    if (!Number.isInteger(idValvula) || idValvula <= 0) {
      this.logger.warn(`Status de valvula ignorado. id_valvula invalido.`);
      return null;
    }

    if (!this.isStatusValvula(value.status_valvula)) {
      this.logger.warn(
        `Status de valvula ${idValvula} ignorado. status_valvula invalido.`,
      );
      return null;
    }

    if (typeof value.ack !== 'boolean') {
      this.logger.warn(
        `Status de valvula ${idValvula} ignorado. ack precisa ser boolean.`,
      );
      return null;
    }

    if (value.falha !== undefined && typeof value.falha !== 'boolean') {
      this.logger.warn(
        `Status de valvula ${idValvula} ignorado. falha precisa ser boolean.`,
      );
      return null;
    }

    return {
      id_valvula: idValvula,
      status_valvula: value.status_valvula,
      ack: value.ack,
      falha: value.falha ?? false,
    };
  }

  private async updateValveStatus(
    input: ValvulaHardwareStatusInput,
    statusAt: Date,
  ): Promise<ValvulaStatusResult> {
    const valvula = await this.prisma.valvulas.findUnique({
      where: { id_valvula: input.id_valvula },
      select: {
        id_valvula: true,
        ativo: true,
      },
    });

    if (!valvula) {
      this.logger.warn(
        `ACK de valvula ignorado. Valvula ${input.id_valvula} nao encontrada.`,
      );
      return {
        ...input,
        atualizado: false,
        motivo: 'Valvula nao encontrada.',
      };
    }

    if (!valvula.ativo) {
      this.logger.warn(
        `ACK de valvula ignorado. Valvula ${input.id_valvula} esta inativa.`,
      );
      return {
        ...input,
        atualizado: false,
        motivo: 'Valvula inativa.',
      };
    }

    const status_valvula = this.resolvePersistedStatus(input);

    await this.prisma.valvulas.update({
      where: { id_valvula: input.id_valvula },
      data: {
        status_valvula,
        ultimo_acionamento: statusAt,
        atualizado_em: new Date(),
      },
    });

    return {
      ...input,
      status_valvula,
      atualizado: true,
    };
  }

  private resolvePersistedStatus(
    input: ValvulaHardwareStatusInput,
  ): StatusValvula {
    if (input.falha) {
      return StatusValvula.FALHA;
    }

    if (!input.ack) {
      return StatusValvula.DESCONHECIDA;
    }

    return input.status_valvula;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private isStatusValvula(value: unknown): value is StatusValvula {
    return (
      typeof value === 'string' &&
      Object.values(StatusValvula).includes(value as StatusValvula)
    );
  }
}
