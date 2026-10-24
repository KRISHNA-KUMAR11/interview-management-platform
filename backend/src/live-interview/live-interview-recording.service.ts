import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ObjectStorageService } from '../common/object-storage.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  liveInterviewDetailInclude,
  LiveInterviewContextService,
} from './live-interview-context.service';
import { ToggleRecordingDto } from './dto/live-interview.dto';

@Injectable()
export class LiveInterviewRecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: LiveInterviewContextService,
    private readonly storage: ObjectStorageService,
  ) {}

  async toggleRecording(id: string, user: AuthUser, dto: ToggleRecordingDto) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanControl(session, user);

    if (!session.recording_enabled) {
      throw new BadRequestException('Recording is not enabled for this room.');
    }

    if (!user.permissions.includes('LiveInterview.Record')) {
      throw new ForbiddenException('Recording permission required.');
    }

    const updated = await this.prisma.liveInterview.update({
      where: { id: session.id },
      data: { is_recording: dto.isRecording },
      include: liveInterviewDetailInclude,
    });

    return this.context.mapSession(updated);
  }

  async saveRecording(
    id: string,
    user: AuthUser,
    file: Express.Multer.File,
    meta: { label?: string; durationSeconds?: number },
  ) {
    const session = await this.context.findAccessibleSession(id, user);
    if (
      user.isGuest &&
      user.liveInterviewId &&
      user.liveInterviewId !== session.id
    ) {
      throw new ForbiddenException('Access denied for this interview.');
    }

    if (!file) {
      throw new BadRequestException('Recording file is required.');
    }

    const storedPath = await this.storage.saveUpload(
      file,
      `live/${id}/${file.filename}`,
    );

    const recording = await this.prisma.liveInterviewRecording.create({
      data: {
        live_interview_id: id,
        recorded_by_id: user.userId,
        label: meta.label?.trim() || `${user.email} recording`,
        file_name: file.filename,
        file_path: storedPath,
        mime_type: file.mimetype || 'video/webm',
        size_bytes: file.size,
        duration_seconds: meta.durationSeconds ?? null,
      },
      include: {
        recordedBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });

    await this.prisma.liveInterviewEvent.create({
      data: {
        live_interview_id: id,
        actor_user_id: user.userId,
        event_type: 'recording_saved',
        message: `Saved recording (${Math.round(file.size / 1024)} KB)`,
      },
    });

    return {
      id: recording.id,
      label: recording.label,
      mimeType: recording.mime_type,
      sizeBytes: recording.size_bytes,
      durationSeconds: recording.duration_seconds,
      createdAt: recording.created_at,
      recordedBy: {
        id: recording.recordedBy.id,
        firstName: recording.recordedBy.first_name,
        lastName: recording.recordedBy.last_name,
        email: recording.recordedBy.email,
      },
      streamUrl: `/api/v1/live-interviews/${id}/recordings/${recording.id}/stream`,
    };
  }

  async getRecordingFile(id: string, recordingId: string, user: AuthUser) {
    await this.context.findAccessibleSession(id, user);
    const recording = await this.prisma.liveInterviewRecording.findFirst({
      where: { id: recordingId, live_interview_id: id },
    });
    if (!recording) {
      throw new NotFoundException('Recording not found.');
    }
    return recording;
  }

  async pipeRecording(
    recording: { file_path: string; mime_type: string; file_name: string },
    res: Response,
  ) {
    const stream = await this.storage.open(recording.file_path);
    if (!stream) return false;
    res.setHeader('Content-Type', recording.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${recording.file_name}"`,
    );
    stream.pipe(res);
    return true;
  }

  async getReview(id: string, user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException(
        'Candidates cannot view completed interview recordings.',
      );
    }

    const session = await this.context.findAccessibleSession(id, user);
    const [recordings, events] = await Promise.all([
      this.prisma.liveInterviewRecording.findMany({
        where: { live_interview_id: id },
        include: {
          recordedBy: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.liveInterviewEvent.findMany({
        where: { live_interview_id: id },
        include: {
          actor: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    return {
      ...this.context.mapSession(session),
      recordings: recordings.map((recording) => ({
        id: recording.id,
        label: recording.label,
        mimeType: recording.mime_type,
        sizeBytes: recording.size_bytes,
        durationSeconds: recording.duration_seconds,
        createdAt: recording.created_at,
        recordedBy: {
          id: recording.recordedBy.id,
          firstName: recording.recordedBy.first_name,
          lastName: recording.recordedBy.last_name,
          email: recording.recordedBy.email,
        },
        streamUrl: `/api/v1/live-interviews/${id}/recordings/${recording.id}/stream`,
      })),
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        message: event.message,
        createdAt: event.created_at,
        actor: event.actor
          ? {
              id: event.actor.id,
              firstName: event.actor.first_name,
              lastName: event.actor.last_name,
              email: event.actor.email,
            }
          : event.actor,
      })),
    };
  }
}
