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
import { ApiResponseDto } from '../common/dto/api-response.dto';
import { Public, RequirePermissions } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  CreateLiveInterviewDto,
  MediaCheckDto,
  SubmitFeedbackDto,
  ToggleRecordingDto,
  UpdateLiveInterviewDto,
  LogEventDto,
} from './dto/live-interview.dto';
import { LiveInterviewAccessService } from './live-interview-access.service';
import { LiveInterviewFeedbackService } from './live-interview-feedback.service';
import { LiveInterviewRecordingService } from './live-interview-recording.service';
import { LiveInterviewRoomService } from './live-interview-room.service';
import { LiveInterviewSessionService } from './live-interview-session.service';
import { IceServerService } from '../common/ice-server.service';

@Controller('live-interviews')
export class LiveInterviewController {
  constructor(
    private readonly sessionService: LiveInterviewSessionService,
    private readonly accessService: LiveInterviewAccessService,
    private readonly roomService: LiveInterviewRoomService,
    private readonly recordingService: LiveInterviewRecordingService,
    private readonly feedbackService: LiveInterviewFeedbackService,
    private readonly iceServers: IceServerService,
  ) {}

  @Get()
  @RequirePermissions('LiveInterview.Join')
  async list(@CurrentUser() user: AuthUser) {
    const data = await this.sessionService.list(user);
    return ApiResponseDto.ok('Live interviews loaded.', data);
  }

  @Get('ice-servers')
  @RequirePermissions('LiveInterview.Join')
  ice() {
    return ApiResponseDto.ok('Call network settings loaded.', this.iceServers.list());
  }

  @Get('interviewers')
  @RequirePermissions('Interview.Create')
  async interviewers(@CurrentUser() user: AuthUser) {
    const data = await this.sessionService.listInterviewers(user);
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
    return ApiResponseDto.ok('Joined interview as candidate.', data);
  }

  @Get(':id/review')
  @RequirePermissions('LiveInterview.Join')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.recordingService.getReview(id, user);
    return ApiResponseDto.ok('Interview review loaded.', data);
  }

  @Get(':id/recordings/:recordingId/stream')
  @RequirePermissions('LiveInterview.Join')
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
        data: null,
      });
    }
  }

  @Get(':id')
  @RequirePermissions('LiveInterview.Join')
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.sessionService.getById(id, user);
    return ApiResponseDto.ok('Live interview loaded.', data);
  }

  @Post()
  @RequirePermissions('Interview.Create')
  async create(
    @Body() dto: CreateLiveInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.sessionService.create(dto, user);
    return ApiResponseDto.ok('Live interview created.', data);
  }

  @Patch(':id')
  @RequirePermissions('Interview.Edit')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLiveInterviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.sessionService.update(id, dto, user);
    return ApiResponseDto.ok('Live interview updated.', data);
  }

  @Delete(':id')
  @RequirePermissions('Interview.Delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.sessionService.remove(id, user);
    return ApiResponseDto.ok('Live interview deleted.', data);
  }

  @Post(':id/regenerate-invite')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Interview.Edit')
  async regenerateInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.sessionService.regenerateInvite(id, user);
    return ApiResponseDto.ok('Candidate invite link regenerated.', data);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async join(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.roomService.join(id, user);
    return ApiResponseDto.ok('Joined live interview.', data);
  }

  @Post(':id/media-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async mediaCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MediaCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.roomService.mediaCheck(id, user, dto);
    return ApiResponseDto.ok('Media check updated.', data);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.roomService.start(id, user);
    return ApiResponseDto.ok('Interview started.', data);
  }

  @Post(':id/recording')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Record')
  async recording(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleRecordingDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.recordingService.toggleRecording(id, user, dto);
    return ApiResponseDto.ok(
      dto.isRecording ? 'Recording started.' : 'Recording stopped.',
      data,
    );
  }

  @Post(':id/recordings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const dir = join(
            process.cwd(),
            'uploads',
            'live-interviews',
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
    return ApiResponseDto.ok('Recording saved.', data);
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async logEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: LogEventDto,
  ) {
    const data = await this.roomService.logEvent(
      id,
      user,
      body.eventType,
      body.message,
    );
    return ApiResponseDto.ok('Event logged.', data);
  }

  @Post(':id/feedback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async feedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFeedbackDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.feedbackService.submitFeedback(id, user, dto);
    return ApiResponseDto.ok('Feedback submitted.', data);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.roomService.complete(id, user);
    return ApiResponseDto.ok('Interview completed.', data);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('LiveInterview.Join')
  async leave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.roomService.leave(id, user);
    return ApiResponseDto.ok('Left live interview.', data);
  }
}
