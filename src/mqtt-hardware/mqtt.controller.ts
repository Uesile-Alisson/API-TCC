import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MqttService } from './mqtt.service';
import { UpdateMqttConfigDTO } from './dto/update-mqtt-config.dto';
import { MqttCommandRequestDto } from './dto/mqtt-command-request.dto';
import type { CommandOptions } from './commands/interfaces/command-options.interface';

type AuthenticatedUserPayload = {
  sub?: number;
  id_usuario?: number;
  login?: string;
  nivel_acesso: string;
};

@ApiTags('MQTT / Hardware')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mqtt-hardware')
export class MqttController {
  constructor(private readonly mqttService: MqttService) {}

  @Get('status')
  @Roles('ADMINISTRADOR', 'TECNICO', 'OPERADOR')
  @ApiOperation({
    summary: 'Consultar status geral do MQTT e do hardware.',
    description:
      'Retorna estado atual da conexão MQTT, configuração ativa e estado operacional do ESP32/hardware.',
  })
  async getStatus() {
    return await this.mqttService.getStatus();
  }

  @Get('config')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Consultar configuração MQTT ativa.',
    description:
      'Retorna a configuração principal do MQTT sem expor dados sensíveis, como senha/hash.',
  })
  async getConfig() {
    return await this.mqttService.getConfig();
  }

  @Patch('config')
  @Roles('ADMINISTRADOR')
  @ApiOperation({
    summary: 'Atualizar configuração MQTT.',
    description:
      'Atualiza a configuração principal do MQTT e registra o usuário responsável pela alteração.',
  })
  async updateConfig(
    @Body() dto: UpdateMqttConfigDTO,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.updateConfig(dto, this.resolveUserId(user));
  }

  @Post('commands/test')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Testar conexão MQTT.',
    description:
      'Verifica se o cliente MQTT está conectado. Se não estiver, tenta conectar ao broker.',
  })
  async testConnection() {
    return await this.mqttService.testConnection();
  }

  @Post('commands/reconnect')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Reconectar cliente MQTT.',
    description:
      'Força uma conexão do backend com o broker MQTT usando a configuração ativa.',
  })
  async reconnect() {
    return await this.mqttService.reconnect();
  }

  @Post('commands/disconnect')
  @Roles('ADMINISTRADOR')
  @ApiOperation({
    summary: 'Desconectar cliente MQTT.',
    description:
      'Desconecta o cliente MQTT ao broker. Rota restrita a administradores.',
  })
  async disconnect() {
    return await this.mqttService.disconnect();
  }

  @Post('commands/sincronizar-hardware')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Sincronizar hardware.',
    description:
      'Publica comando MQTT para sincronizar o estado do ESP32/hardware com o backend.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async sincronizarHardware(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.sincronizarHardware(
      this.buildCommandOptions(dto, user),
    );
  }

  @Post('commands/reiniciar-comunicacao')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Reiniciar comunicação do hardware.',
    description:
      'Publica comando MQTT para reiniciar a comunicação do ESP32/hardware.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async reiniciarComuicacao(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.reiniciarComunicacao(
      this.buildCommandOptions(dto, user),
    );
  }

  @Post('commands/parada-emergencia')
  @Roles('ADMINISTRADOR', 'TECNICO', 'OPERADOR')
  @ApiOperation({
    summary: 'Acionar parada de emergência.',
    description:
      'Publica comando MQTT de parada de emergência. Deve usar Qos 2 no CommandService.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async paradaEmergencia(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.paradaEmergencia(
      this.buildCommandOptions(dto, user),
    );
  }

  @Post('commands/desligar-todas-bombas')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Desligar todas bombas.',
    description:
      'Publica comando para desligar todas bombas controladas pelo ESP32.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async desligarTodasBombas(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.desligarTodasBombas(
      this.buildCommandOptions(dto, user),
    );
  }

  @Post('commands/abrir-todas-valvulas')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Abrir todas válvulas.',
    description:
      'Publica comando para abrir todas válvulas controladas pelo ESP32.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async abrirTodasValvulas(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.abrirTodasValvulas(
      this.buildCommandOptions(dto, user),
    );
  }

  @Post('commands/fechar-todas-valvulas')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Fechar todas válvulas.',
    description:
      'Publica comando para fechar todas válvulas controladas pelo ESP32.',
  })
  @ApiBody({ type: MqttCommandRequestDto, required: false })
  async fecharTodasValvulas(
    @Body() dto: MqttCommandRequestDto = {},
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.fecharTodasValvulas(
      this.buildCommandOptions(dto, user),
    );
  }

  private buildCommandOptions(
    dto: MqttCommandRequestDto,
    user: AuthenticatedUserPayload,
  ): CommandOptions {
    return {
      motivo: dto.motivo,
      qos: dto.qos,
      solicitado_por: this.resolveUserId(user),
    };
  }

  private resolveUserId(user: AuthenticatedUserPayload): number {
    const idUsuario = user.id_usuario ?? user.sub;

    if (!idUsuario) {
      throw new UnauthorizedException(
        'Usuário autenticado sem identificador válido no token',
      );
    }

    return idUsuario;
  }
}
