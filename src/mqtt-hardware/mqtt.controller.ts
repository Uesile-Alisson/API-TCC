import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MqttService } from './mqtt.service';
import { UpdateMqttConfigDTO } from './dto/update-mqtt-config.dto';
import {
  MqttCommandRequestDto,
  MqttEmergencyStopRequestDto,
} from './dto/mqtt-command-request.dto';
import { UpdateMqttCredentialsDTO } from './dto/update-mqtt-credentials.dto';
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
@Throttle({
  default: { limit: 60, ttl: 60_000, blockDuration: 60_000 },
})
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
  @Throttle({
    default: { limit: 10, ttl: 5 * 60_000, blockDuration: 5 * 60_000 },
  })
  @Roles('ADMINISTRADOR')
  @ApiOperation({
    summary: 'Atualizar configuração MQTT.',
    description:
      'Testa a configuracao candidata em um cliente isolado, grava e reconecta o cliente principal. Se a aplicacao falhar, restaura a configuracao anterior.',
  })
  @ApiConflictResponse({
    description:
      'A atualizacao foi bloqueada por processo operacional, por outro update MQTT ou por perda do lease.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'O broker recusou autenticacao ou uma assinatura obrigatoria. A configuracao anterior foi preservada.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'O broker nao confirmou a candidata ou a aplicacao principal falhou. A resposta informa o resultado do rollback.',
  })
  async updateConfig(
    @Body() dto: UpdateMqttConfigDTO,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.updateConfig(dto, this.resolveUserId(user));
  }

  @Put('credentials')
  @Throttle({
    default: { limit: 3, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  @Roles('ADMINISTRADOR')
  @ApiOperation({
    summary: 'Configurar credenciais MQTT externas.',
    description:
      'Testa usuario e senha em uma conexao MQTT temporaria. Somente apos o broker aceitar a conexao e as assinaturas obrigatorias, substitui o arquivo seguro externo, reconecta o cliente principal e retorna indicadores sem expor as credenciais.',
  })
  @ApiConflictResponse({
    description:
      'A atualizacao foi bloqueada porque existe um processo em partida, execucao ou pausa, ou porque outra atualizacao de credenciais ja esta em andamento.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'O broker recusou a autenticacao ou alguma assinatura obrigatoria. As credenciais anteriores foram preservadas.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'O broker estava indisponivel e a credencial candidata nao pode ser confirmada. As credenciais anteriores foram preservadas.',
  })
  async updateCredentials(
    @Body() dto: UpdateMqttCredentialsDTO,
    @CurrentUser() user: AuthenticatedUserPayload,
  ) {
    return await this.mqttService.updateCredentials(
      dto,
      this.resolveUserId(user),
    );
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
      'Força uma conexão do backend com o broker MQTT usando a configuração ativa. É bloqueado durante qualquer estado operacional protegido.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
  })
  async reconnect(@CurrentUser() user: AuthenticatedUserPayload) {
    return await this.mqttService.reconnect(this.resolveUserId(user));
  }

  @Post('commands/disconnect')
  @Roles('ADMINISTRADOR')
  @ApiOperation({
    summary: 'Desconectar cliente MQTT.',
    description:
      'Desconecta o cliente MQTT do broker quando não existe estado operacional protegido. Rota restrita a administradores.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
  })
  async disconnect(@CurrentUser() user: AuthenticatedUserPayload) {
    return await this.mqttService.disconnect(this.resolveUserId(user));
  }

  @Post('commands/sincronizar-hardware')
  @Roles('ADMINISTRADOR', 'TECNICO')
  @ApiOperation({
    summary: 'Sincronizar hardware.',
    description:
      'Publica a configuração retida para sincronizar o ESP32/hardware somente fora de estados operacionais protegidos.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
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
      'Publica comando MQTT para reiniciar a comunicação do ESP32/hardware somente fora de estados operacionais protegidos.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
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
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Acionar parada de emergência.',
    description:
      'Delega ao coordenador persistente quando existe processo operacional e executa a sequencia global best-effort somente quando nao existe processo alvo. HTTP 202 nao significa confirmacao do controlador.',
  })
  @ApiAcceptedResponse({
    description:
      'Solicitacao aceita; o corpo distingue persistencia, escopo e confirmacao pendente.',
  })
  @ApiBody({ type: MqttEmergencyStopRequestDto, required: false })
  async paradaEmergencia(
    @Body() dto: MqttEmergencyStopRequestDto = {},
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
      'Publica comando para desligar todas bombas controladas pelo ESP32 somente fora de estados operacionais protegidos.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
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
      'Publica comando para abrir todas válvulas controladas pelo ESP32 somente fora de estados operacionais protegidos.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
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
      'Publica comando para fechar todas válvulas controladas pelo ESP32 somente fora de estados operacionais protegidos.',
  })
  @ApiConflictResponse({
    description:
      'Operação bloqueada por processo ativo/pausado, partida, encerramento, lifecycle de tanque, lease humano ou outra operação MQTT exclusiva.',
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
    dto: MqttCommandRequestDto & { id_processo?: number },
    user: AuthenticatedUserPayload,
  ): CommandOptions {
    return {
      motivo: dto.motivo,
      qos: dto.qos,
      correlation_id: dto.correlation_id,
      ...(dto.id_processo !== undefined
        ? { id_processo: dto.id_processo }
        : {}),
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
