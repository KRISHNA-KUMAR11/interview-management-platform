import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  CreateRoleDto,
  UpdateCompanyDto,
  UpdateProfileDto,
  UpdateRoleDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('Settings.View')
  async get(@CurrentUser() user: AuthUser) {
    const data = await this.settingsService.get(user);
    return ApiResponseDto.ok('Settings loaded.', data);
  }

  @Patch('company')
  @RequirePermissions('Settings.Edit')
  async updateCompany(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.settingsService.updateCompany(dto, user);
    return ApiResponseDto.ok('Company updated.', data);
  }

  @Patch('profile')
  @RequirePermissions('Settings.View')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.settingsService.updateProfile(dto, user);
    return ApiResponseDto.ok('Profile updated.', data);
  }

  @Post('roles')
  @RequirePermissions('Settings.Edit')
  async createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: AuthUser) {
    const data = await this.settingsService.createRole(dto, user);
    return ApiResponseDto.ok('Role created.', data);
  }

  @Patch('roles/:id')
  @RequirePermissions('Settings.Edit')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.settingsService.updateRole(id, dto, user);
    return ApiResponseDto.ok('Role updated.', data);
  }

  @Delete('roles/:id')
  @RequirePermissions('Settings.Edit')
  async deleteRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.settingsService.deleteRole(id, user);
    return ApiResponseDto.ok('Role deleted.', data);
  }
}
