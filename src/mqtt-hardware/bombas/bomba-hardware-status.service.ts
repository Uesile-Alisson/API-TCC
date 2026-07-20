import { Injectable, Logger } from '@nestjs/common';
import { tipobomba } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Esp32StatusPumpDTO } from '../dto/esp32-status.dto';

export interface BombaHardwareStatusInput {
  id_bomba?: number;
  codigo_hardware?: string;
  ligada: boolean;
  disponivel: boolean;
  falha: boolean;
}

export interface BombaHardwareStatusResult {
  id_bomba: number;
  codigo_hardware: string | null;
  tipo_bomba: tipobomba | null;
  ligada: boolean;
  disponivel: boolean;
  falha: boolean;
  atualizado: boolean;
  status_em: Date;
  motivo?: string;
}

@Injectable()
export class BombaHardwareStatusService {
  private readonly logger = new Logger(BombaHardwareStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processStatusPayload(
    bombas: Esp32StatusPumpDTO[] | undefined,
    statusAt: Date,
  ): Promise<BombaHardwareStatusResult[]> {
    if (!bombas || bombas.length === 0) {
      return [];
    }

    const results: BombaHardwareStatusResult[] = [];

    for (const value of bombas) {
      const parsed = this.parsePumpStatus(value);

      if (!parsed) {
        results.push({
          id_bomba: 0,
          codigo_hardware: null,
          tipo_bomba: null,
          ligada: false,
          disponivel: false,
          falha: true,
          atualizado: false,
          status_em: statusAt,
          motivo: 'Payload de bomba invalido.',
        });
        continue;
      }

      results.push(await this.updatePumpStatus(parsed, statusAt));
    }

    return results;
  }

  private parsePumpStatus(value: unknown): BombaHardwareStatusInput | null {
    if (!this.isRecord(value)) {
      this.logger.warn('Status de bomba ignorado. Entrada invalida.');
      return null;
    }

    const idBomba = Number(value.id_bomba);
    const codigoHardware =
      typeof value.codigo_hardware === 'string' &&
      value.codigo_hardware.trim().length > 0
        ? value.codigo_hardware.trim()
        : undefined;

    if ((!Number.isInteger(idBomba) || idBomba <= 0) && !codigoHardware) {
      this.logger.warn(
        'Status de bomba ignorado. id_bomba e codigo_hardware ausentes.',
      );
      return null;
    }

    if (
      typeof value.ligada !== 'boolean' ||
      typeof value.disponivel !== 'boolean'
    ) {
      this.logger.warn(
        `Status de bomba ${idBomba || codigoHardware} ignorado. ligada e disponivel precisam ser boolean.`,
      );
      return null;
    }

    if (value.falha !== undefined && typeof value.falha !== 'boolean') {
      this.logger.warn(
        `Status de bomba ${idBomba || codigoHardware} ignorado. falha precisa ser boolean.`,
      );
      return null;
    }

    return {
      ...(Number.isInteger(idBomba) && idBomba > 0
        ? { id_bomba: idBomba }
        : {}),
      ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
      ligada: value.ligada,
      disponivel: value.disponivel,
      falha: value.falha ?? false,
    };
  }

  private async updatePumpStatus(
    input: BombaHardwareStatusInput,
    statusAt: Date,
  ): Promise<BombaHardwareStatusResult> {
    const bomba = await this.prisma.bombas.findUnique({
      where: input.id_bomba
        ? { id_bomba: input.id_bomba }
        : { codigo_hardware: input.codigo_hardware },
      select: {
        id_bomba: true,
        codigo_hardware: true,
        tipo_bomba: true,
      },
    });

    if (!bomba) {
      this.logger.warn(
        `Status de bomba ignorado. Bomba ${input.id_bomba ?? input.codigo_hardware} nao encontrada.`,
      );

      return {
        ...input,
        id_bomba: input.id_bomba ?? 0,
        codigo_hardware: input.codigo_hardware ?? null,
        tipo_bomba: null,
        atualizado: false,
        status_em: statusAt,
        motivo: 'Bomba nao encontrada.',
      };
    }

    if (
      input.id_bomba &&
      input.codigo_hardware &&
      bomba.codigo_hardware !== input.codigo_hardware
    ) {
      this.logger.warn(
        `Status de bomba ignorado. id_bomba ${input.id_bomba} nao corresponde ao codigo_hardware ${input.codigo_hardware}.`,
      );

      return {
        ...input,
        id_bomba: input.id_bomba,
        codigo_hardware: input.codigo_hardware,
        tipo_bomba: bomba.tipo_bomba,
        atualizado: false,
        status_em: statusAt,
        motivo: 'Identidade da bomba inconsistente.',
      };
    }

    const disponivel = input.disponivel && !input.falha;

    await this.prisma.bombas.update({
      where: { id_bomba: bomba.id_bomba },
      data: {
        ligada_hardware: input.ligada,
        disponivel_hardware: disponivel,
        ultimo_status_hardware_em: statusAt,
        atualizado_em: new Date(),
      },
    });

    return {
      ...input,
      id_bomba: bomba.id_bomba,
      codigo_hardware: bomba.codigo_hardware,
      tipo_bomba: bomba.tipo_bomba,
      disponivel,
      atualizado: true,
      status_em: statusAt,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
