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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  Public,
  RequirePermissions,
} from '../common/decorators/auth.decorators';
import { ApiResponseDto } from '../common/dto/api-response.dto';
import {
  CreateTechnicalInterviewDto,
  GradeAnswerDto,
  LogIntegrityEventDto,
  SubmitAnswersDto,
  UpdateTechnicalInterviewDto,
} from './dto/technical-interview.dto';
import { TechnicalInterviewAccessService } from './technical-interview-access.service';
import { TechnicalInterviewAssessmentService } from './technical-interview-assessment.service';
import { TechnicalInterviewAttemptService } from './technical-interview-attempt.service';
import { TechnicalInterviewRecordingService } from './technical-interview-recording.service';
import { TechnicalInterviewReviewService } from './technical-interview-review.service';

@Controller('technical-interviews')
export class TechnicalInterviewController {
  constructor(
    private readonly assessmentService: TechnicalInterviewAssessmentService,
    private readonly accessService: TechnicalInterviewAccessService,
    private readonly attemptService: TechnicalInterviewAttemptService,
    private readonly reviewService: TechnicalInterviewReviewService,
    private readonly recordingService: TechnicalInterviewRecordingService,
  ) {}

  @Get()
  @RequirePermissions('TechnicalInterview.View')
  async list(@CurrentUser() user: AuthUser) {
    const data = await this.assessmentService.list(user);
    return ApiResponseDto.ok('Technical interviews loaded.', data);
  }

  @Get('interviewers')
  @RequirePermissions('TechnicalInterview.Create')
  async interviewers(@CurrentUser() user: AuthUser) {
    const data = await this.assessmentService.interviewers(user);
    return ApiResponseDto.ok('Interviewers loaded.', data);
  }

  @Public()
  @Get('invite/:token')
  async invitePreview(@Param('token') token: string) {
    const data = await this.accessService.getByInviteToken(token);
    return ApiResponseDto.ok('Invite loaded.', data);
  }

  @Public()
  @Post('invite/:token/enter')
  @HttpCode(HttpStatus.OK)
  async enterAsGuest(@Param('token') token: string) {
    const data = await this.accessService.enterAsGuest(token);
    return ApiResponseDto.ok('Joined assessment.', data);
  }

  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.assessmentService.getById(id, user);
    return ApiResponseDto.ok('Technical interview loaded.', data);
  }

  @Post()
  @RequirePermissions('TechnicalInterview.Create')
  async create(
    @Body() dto: CreateTechnicalInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.assessmentService.create(dto, user);
    return ApiResponseDto.ok('Technical interview created.', data);
  }

  @Patch(':id')
  @RequirePermissions('TechnicalInterview.Create')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTechnicalInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.assessmentService.update(id, dto, user);
    return ApiResponseDto.ok('Technical interview updated.', data);
  }

  @Delete(':id')
  @RequirePermissions('Interview.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.assessmentService.remove(id, user);
    return ApiResponseDto.ok('Technical interview deleted.', data);
  }

  @Post(':id/regenerate-invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Create')
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.assessmentService.regenerateInvite(id, user);
    return ApiResponseDto.ok('Invite link regenerated.', data);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Take')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.attemptService.start(id, user);
    return ApiResponseDto.ok('Assessment started.', data);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Take')
  async saveAnswers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswersDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.attemptService.saveAnswers(id, dto, user);
    return ApiResponseDto.ok('Answers saved.', data);
  }

  @Post(':id/integrity')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Take')
  async integrity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogIntegrityEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.attemptService.logIntegrity(
      id,
      user,
      dto.eventType,
      dto.message,
    );
    return ApiResponseDto.ok('Integrity event recorded.', data);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Take')
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnswersDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.attemptService.submit(id, dto, user);
    return ApiResponseDto.ok('Assessment submitted.', data);
  }

  @Post(':id/recordings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('TechnicalInterview.Take')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(
            process.cwd(),
            'uploads',
            'technical-interviews',
            String(req.params.id),
          );
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const ext = file.mimetype.includes('mp4') ? 'mp4' : 'webm';
          cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 },
    }),
  )
  async uploadRecording(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Body('label') label?: string,
    @Body('durationSeconds') durationSeconds?: string,
  ) {
    const data = await this.recordingService.saveRecording(id, user, file, {
      label,
      durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
    });
    return ApiResponseDto.ok('Face recording saved.', data);
  }

  @Get(':id/recordings/:recordingId/stream')
  @RequirePermissions('TechnicalInterview.View')
  async streamRecording(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordingId', ParseUUIDPipe) recordingId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const recording = await this.recordingService.getRecordingFile(
      id,
      recordingId,
      user,
    );
    const streamed = await this.recordingService.pipeRecording(recording, res);
    if (!streamed) {
      return res.status(404).json({
        success: false,
        message: 'Recording file is missing.',
      });
    }
  }

  @Post(':id/grade')
  @HttpCode(HttpStatus.OK)
  async grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.reviewService.grade(id, dto, user);
    return ApiResponseDto.ok('Answer graded.', data);
  }
}
