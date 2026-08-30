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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/auth.decorators';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { CandidatesService } from './candidates.service';
import {
  CreateCandidateDto,
  ListCandidatesQueryDto,
  UpdateCandidateDto,
} from './dto/candidate.dto';

@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get()
  @RequirePermissions('Candidate.View')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListCandidatesQueryDto,
  ) {
    const data = await this.candidatesService.list(user, query);
    return ApiResponseDto.ok('Candidates loaded.', data);
  }

  @Get(':id')
  @RequirePermissions('Candidate.View')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.candidatesService.getById(id, user);
    return ApiResponseDto.ok('Candidate loaded.', data);
  }

  @Post()
  @RequirePermissions('Candidate.Create')
  async create(@Body() dto: CreateCandidateDto, @CurrentUser() user: AuthUser) {
    const data = await this.candidatesService.create(dto, user);
    return ApiResponseDto.ok('Candidate created.', data);
  }

  @Patch(':id')
  @RequirePermissions('Candidate.Edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidateDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.candidatesService.update(id, dto, user);
    return ApiResponseDto.ok('Candidate updated.', data);
  }

  @Delete(':id')
  @RequirePermissions('Candidate.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.candidatesService.remove(id, user);
    return ApiResponseDto.ok('Candidate deleted.', data);
  }
}
