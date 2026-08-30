import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  CreateInterviewDto,
  ListInterviewsQueryDto,
  UpdateInterviewDto,
} from './dto/interview.dto';
import { InterviewsService } from './interviews.service';

@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  @RequirePermissions('Interview.View')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListInterviewsQueryDto,
  ) {
    const data = await this.interviewsService.list(user, query);
    return ApiResponseDto.ok('Interviews loaded.', data);
  }

  @Get('summary')
  @RequirePermissions('Interview.View')
  async summary(@CurrentUser() user: AuthUser) {
    const data = await this.interviewsService.summary(user);
    return ApiResponseDto.ok('Interview summary loaded.', data);
  }

  @Get('interviewers')
  @RequirePermissions('Interview.View')
  async interviewers(@CurrentUser() user: AuthUser) {
    const data = await this.interviewsService.listInterviewers(user);
    return ApiResponseDto.ok('Interviewers loaded.', data);
  }

  @Get(':id')
  @RequirePermissions('Interview.View')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.interviewsService.getById(id, user);
    return ApiResponseDto.ok('Interview loaded.', data);
  }

  @Post()
  @RequirePermissions('Interview.Create')
  async create(@Body() dto: CreateInterviewDto, @CurrentUser() user: AuthUser) {
    const data = await this.interviewsService.create(dto, user);
    return ApiResponseDto.ok('Interview scheduled.', data);
  }

  @Patch(':id')
  @RequirePermissions('Interview.Edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.interviewsService.update(id, dto, user);
    return ApiResponseDto.ok('Interview updated.', data);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Interview.Edit')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.interviewsService.cancel(id, user);
    return ApiResponseDto.ok('Interview cancelled.', data);
  }

  @Delete(':id')
  @RequirePermissions('Interview.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.interviewsService.remove(id, user);
    return ApiResponseDto.ok('Interview deleted.', data);
  }
}
