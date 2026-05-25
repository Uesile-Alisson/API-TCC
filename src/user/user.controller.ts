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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('user')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UserRoles(nivelacesso.ADMINISTRADOR)
  create(@Body() dto: CreateUserDTO) {
    return this.userService.create(dto);
  }

  @Get()
  @UserRoles(nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO)
  listUsers() {
    return this.userService.listUsers();
  }

  @Get(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO)
  findUser(@Param('id', ParseIntPipe) id_usuario: number) {
    return this.userService.findUser(id_usuario);
  }

  @Patch(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  updateUser(
    @Param('id', ParseIntPipe) id_usuario: number,
    @Body() dto: UpdateUserDTO,
  ) {
    return this.userService.updateUser(id_usuario, dto);
  }

  @Patch(':id/role')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  updateUserRole(
    @Param('id', ParseIntPipe) id_usuario: number,
    @Body() dto: UpdateUserRolesDTO,
  ) {
    return this.userService.updateUserRole(id_usuario, dto);
  }

  @Delete(':id')
  @UserRoles(nivelacesso.ADMINISTRADOR)
  removeUser(@Param('id', ParseIntPipe) id_usuario: number) {
    return this.userService.removeUser(id_usuario);
  }
}
