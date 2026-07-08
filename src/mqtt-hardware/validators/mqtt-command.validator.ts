import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { MqttCommandDTO } from '../dto/mqtt-command.dto';
import { HardwareCommand } from '../enums/hardware-commands.enum';

type CommandTargetRule = {
  command: HardwareCommand;
  requiresPump?: boolean;
  requiresValve?: boolean;
  requiresNoSpecificTarget?: boolean;
};

export class MqttCommandoValidator {
  private static readonly PUMP_COMMANDS = [
    HardwareCommand.LIGAR_BOMBA,
    HardwareCommand.DESLIGAR_BOMBA,
  ] as const;

  private static readonly VALVE_COMMANDS = [
    HardwareCommand.ABRIR_VALVULA,
    HardwareCommand.FECHAR_VALVULA,
  ] as const;

  private static readonly GLOBAL_COMMANDS = [
    HardwareCommand.PARADA_EMERGENCIA,
    HardwareCommand.DESLIGAR_TODAS_BOMBAS,
    HardwareCommand.DESLIGAR_TODAS_VALVULAS,
    HardwareCommand.INICIAR_PROCESSO_VACUO,
    HardwareCommand.PARAR_PROCESSO,
    HardwareCommand.SINCRONIZAR_HARDWARE,
  ] as const;

  private static readonly COMMAND_RULES: readonly CommandTargetRule[] = [
    ...MqttCommandoValidator.PUMP_COMMANDS.map((command) => ({
      command,
      requiresPump: true,
    })),

    ...MqttCommandoValidator.VALVE_COMMANDS.map((command) => ({
      command,
      requiresValve: true,
    })),

    ...MqttCommandoValidator.GLOBAL_COMMANDS.map((command) => ({
      command,
      requiresNoSpecificTarget: true,
    })),
  ];

  static validate(dto: MqttCommandDTO): MqttCommandDTO {
    const commandInstance = plainToInstance(MqttCommandDTO, dto);

    const errors = validateSync(commandInstance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Comando MQTT inválido.',
        errors: this.formatValidationErrors(errors),
      });
    }

    this.validateKnownCommand(commandInstance.comando);
    this.validateTargetByCommand(commandInstance);
    this.validateNoTankTarget(commandInstance);

    return commandInstance;
  }

  private static validateKnownCommand(command: HardwareCommand): void {
    const commandExists = this.COMMAND_RULES.some(
      (rule) => rule.command === command,
    );

    if (!commandExists) {
      throw new BadRequestException(`Comando MQTT não reconhecido ${command}`);
    }
  }

  private static validateTargetByCommand(dto: MqttCommandDTO): void {
    const rule = this.COMMAND_RULES.find(
      (currentRule) => currentRule.command === dto.comando,
    );

    if (!rule) {
      throw new BadRequestException(
        `Regra de vaidação não encontrada para o comando: ${dto.comando}`,
      );
    }

    if (rule.requiresPump) {
      this.validatePositiveInteger(dto.id_bomba, 'id_bomba');
      this.validateValveNotProvided(dto);
      return;
    }

    if (rule.requiresValve) {
      this.validatePositiveInteger(dto.id_valvula, 'id_valvula');
      this.validatePumpNotProvided(dto);
      return;
    }

    if (rule.requiresNoSpecificTarget) {
      this.validateNoSpecificTarget(dto);
    }
  }

  private static validateNoTankTarget(dto: MqttCommandDTO): void {
    const commandAsRecord = dto as unknown as Record<string, unknown>;

    if (
      Object.prototype.hasOwnProperty.call(commandAsRecord, 'id_tanque') &&
      commandAsRecord.id_tanque !== undefined &&
      commandAsRecord.id_tanque !== null
    ) {
      throw new BadRequestException(
        'Comando MQTT não deve ser enviado diretamente para tanque. Use id_bomba para relé ou id_valvula para válvula.',
      );
    }
  }

  private static validateNoSpecificTarget(dto: MqttCommandDTO): void {
    if (dto.id_bomba !== undefined && dto.id_bomba !== null) {
      throw new BadRequestException(
        `O comando ${dto.comando} é global e não deve receber id_bomba.`,
      );
    }

    if (dto.id_valvula !== undefined && dto.id_valvula !== null) {
      throw new BadRequestException(
        `O comando ${dto.comando} é global e não deve receber id_valvula.`,
      );
    }
  }

  private static validatePumpNotProvided(dto: MqttCommandDTO): void {
    if (dto.id_bomba !== undefined && dto.id_bomba !== null) {
      throw new BadRequestException(
        `O comando ${dto.comando} deve ser direcionado por id_valvula, não por id_bomba.`,
      );
    }
  }

  private static validateValveNotProvided(dto: MqttCommandDTO): void {
    if (dto.id_valvula !== undefined && dto.id_valvula !== null) {
      throw new BadRequestException(
        `O comando ${dto.comando} deve ser direcionado por id_bomba, não por id_valvula.`,
      );
    }
  }

  private static validatePositiveInteger(
    value: number | undefined | null,
    fieldName: string,
  ): void {
    if (!Number.isInteger(value) || value === null || value === undefined) {
      throw new BadRequestException(
        `${fieldName} é obrigatório e deve ser um número inteiro positivo.`,
      );
    }

    if (value <= 0) {
      throw new BadRequestException(`${fieldName} deve ser maior que zero.`);
    }
  }

  private static formatValidationErrors(erros: ValidationError[]): string[] {
    return erros.flatMap((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints)
        : [];

      const children = error.children?.length
        ? this.formatValidationErrors(error.children)
        : [];

      return [...constraints, ...children];
    });
  }
}
