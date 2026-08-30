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
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionBankService } from './question-bank.service';

@Controller('question-bank')
export class QuestionBankController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @Get()
  @RequirePermissions('QuestionBank.View')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    const data = await this.questionBankService.list(user, query);
    return ApiResponseDto.ok('Questions loaded.', data);
  }

  @Get(':id')
  @RequirePermissions('QuestionBank.View')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.questionBankService.getById(id, user);
    return ApiResponseDto.ok('Question loaded.', data);
  }

  @Post()
  @RequirePermissions('QuestionBank.Create')
  async create(@Body() dto: CreateQuestionDto, @CurrentUser() user: AuthUser) {
    const data = await this.questionBankService.create(dto, user);
    return ApiResponseDto.ok('Question created.', data);
  }

  @Patch(':id')
  @RequirePermissions('QuestionBank.Edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.questionBankService.update(id, dto, user);
    return ApiResponseDto.ok('Question updated.', data);
  }

  @Delete(':id')
  @RequirePermissions('QuestionBank.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.questionBankService.remove(id, user);
    return ApiResponseDto.ok('Question deleted.', data);
  }
}
