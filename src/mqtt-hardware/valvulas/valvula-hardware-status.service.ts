import { Injectable, Logger } from '@nestjs/common';
import { StatusValvula } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Esp32StatusValveDTO } from '../dto/esp32-status.dto';

export interface ValvulaHardwareStatusInput {
  id_valvula?: number;
  codigo_hardware?: string;
  status_valvula: StatusValvula;
  ack: boolean;
  falha: boolean;
}

export interface ValvulaHardwareStatusResult {
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
    valvulas: Esp32StatusValveDTO[] | Record<string, unknown> | undefined,
    statusAt: Date,
  ): Promise<ValvulaHardwareStatusResult[]> {
    if (!valvulas || Object.keys(valvulas).length === 0) {
      return [];
    }

    const results: ValvulaHardwareStatusResult[] = [];
    const entries: [string, unknown][] = Array.isArray(valvulas)
      ? valvulas.map((value) => ['', value])
      : Object.entries(valvulas);

    for (const [key, value] of entries) {
      const parsed = this.parseValveStatus(key, value);

      if (!parsed) {
        results.push({
          id_valvula: Number.isInteger(Number(key)) ? Number(key) : 0,
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
    const codigoHardware =
      typeof value.codigo_hardware === 'string' &&
      value.codigo_hardware.trim().length > 0
        ? value.codigo_hardware.trim()
        : undefined;

    if ((!Number.isInteger(idValvula) || idValvula <= 0) && !codigoHardware) {
      this.logger.warn(
        `Status de valvula ignorado. id_valvula e codigo_hardware ausentes.`,
      );
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
      ...(Number.isInteger(idValvula) && idValvula > 0
        ? { id_valvula: idValvula }
        : {}),
      ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
      status_valvula: value.status_valvula,
      ack: value.ack,
      falha: value.falha ?? false,
    };
  }

  private async updateValveStatus(
    input: ValvulaHardwareStatusInput,
    statusAt: Date,
  ): Promise<ValvulaHardwareStatusResult> {
    const valvula = await this.prisma.valvulas.findUnique({
      where: input.id_valvula
        ? { id_valvula: input.id_valvula }
        : { codigo_hardware: input.codigo_hardware },
      select: {
        id_valvula: true,
        ativo: true,
      },
    });

    if (!valvula) {
      this.logger.warn(
        `ACK de valvula ignorado. Valvula ${input.id_valvula ?? input.codigo_hardware} nao encontrada.`,
      );
      return {
        ...input,
        id_valvula: input.id_valvula ?? 0,
        atualizado: false,
        motivo: 'Valvula nao encontrada.',
      };
    }

    if (!valvula.ativo) {
      this.logger.warn(
        `ACK de valvula ignorado. Valvula ${valvula.id_valvula} esta inativa.`,
      );
      return {
        ...input,
        id_valvula: valvula.id_valvula,
        atualizado: false,
        motivo: 'Valvula inativa.',
      };
    }

    const status_valvula = this.resolvePersistedStatus(input);

    await this.prisma.valvulas.update({
      where: { id_valvula: valvula.id_valvula },
      data: {
        status_valvula,
        ultimo_acionamento: statusAt,
        atualizado_em: new Date(),
      },
    });

    return {
      ...input,
      id_valvula: valvula.id_valvula,
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
