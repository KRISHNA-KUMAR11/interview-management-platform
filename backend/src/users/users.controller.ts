import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('User.View')
  async list(@CurrentUser() user: AuthUser, @Query() query: ListUsersQueryDto) {
    const data = await this.usersService.list(user, query);
    return ApiResponseDto.ok('Users loaded.', data);
  }

  @Get('roles')
  @RequirePermissions('User.View')
  async listRoles(@CurrentUser() user: AuthUser) {
    const data = await this.usersService.listRoles(user);
    return ApiResponseDto.ok('Roles loaded.', data);
  }

  @Get(':id')
  @RequirePermissions('User.View')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.usersService.getById(id, user);
    return ApiResponseDto.ok('User loaded.', data);
  }

  @Post()
  @RequirePermissions('User.Create')
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    const data = await this.usersService.create(dto, user);
    return ApiResponseDto.ok('User created.', data);
  }

  @Patch(':id')
  @RequirePermissions('User.Edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.usersService.update(id, dto, user);
    return ApiResponseDto.ok('User updated.', data);
  }

  @Post(':id/reset-password')
  @RequirePermissions('User.Edit')
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.usersService.resetPassword(id, dto, user);
    return ApiResponseDto.ok('Password reset.', data);
  }

  @Delete(':id')
  @RequirePermissions('User.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.usersService.remove(id, user);
    return ApiResponseDto.ok('User deleted.', data);
  }
}
