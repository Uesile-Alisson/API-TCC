import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { nivelacesso } from '@prisma/client';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { UserRoles } from './decorators/user.decorator';
import { RolesGuard } from './guards/roles.guard';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { UpdateUserRolesDTO } from './dto/update-user.roles';
import { UserService } from './user.service';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { Throttle } from '@nestjs/throttler';
import {
  CreateUserResponseDTO,
  UserMessageResponseDTO,
  UserResponseDTO,
} from './dto/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('user')
@UseGuards(JwtAuthGuard, RolesGuard)
@Throttle({
  default: { limit: 30, ttl: 60_000, blockDuration: 60_000 },
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UserRoles(nivelacesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Cria um usuario com senha temporaria de uso unico.' })
  @ApiCreatedResponse({ type: CreateUserResponseDTO })
  create(@Body() dto: CreateUserDTO) {
    return this.userService.create(dto);
  }

  @Get()
  @UserRoles(nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO)
  @ApiOperation({ summary: 'Lista usuarios sem campos de autenticacao.' })
  @ApiOkResponse({ type: UserResponseDTO, isArray: true })
  listUsers() {
    return this.userService.listUsers();
  }

  @Get(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO)
  @ApiOperation({ summary: 'Consulta um usuario pelo identificador.' })
  @ApiOkResponse({ type: UserResponseDTO })
  findUser(@Param('id', ParseIntPipe) id_usuario: number) {
    return this.userService.findUser(id_usuario);
  }

  @Patch(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Atualiza o cadastro de um usuario.' })
  @ApiOkResponse({ type: UserResponseDTO })
  updateUser(
    @Param('id', ParseIntPipe) id_usuario: number,
    @Body() dto: UpdateUserDTO,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.updateUser(id_usuario, dto, currentUser);
  }

  @Patch(':id/role')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Atualiza o nivel de acesso de um usuario.' })
  @ApiOkResponse({ type: UserResponseDTO })
  updateUserRole(
    @Param('id', ParseIntPipe) id_usuario: number,
    @Body() dto: UpdateUserRolesDTO,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.updateUserRole(id_usuario, dto, currentUser);
  }

  @Delete(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  @ApiOperation({ summary: 'Exclui um usuario e revoga seus sockets.' })
  @ApiOkResponse({ type: UserMessageResponseDTO })
  removeUser(
    @Param('id', ParseIntPipe) id_usuario: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.userService.removeUser(id_usuario, currentUser);
  }
}
