import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions('Dashboard.View')
  async overview(@CurrentUser() user: AuthUser) {
    const data = await this.dashboardService.overview(user);
    return ApiResponseDto.ok('Dashboard loaded.', data);
  }
}
