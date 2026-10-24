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
import { TechnicalInterviewContextService } from './technical-interview-context.service';

@Injectable()
export class TechnicalInterviewRecordingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TechnicalInterviewContextService,
    private readonly storage: ObjectStorageService,
  ) {}

  async saveRecording(
    id: string,
    user: AuthUser,
    file: Express.Multer.File,
    meta: { label?: string; durationSeconds?: number },
  ) {
    const session = await this.context.findAccessible(id, user);

    if (user.isGuest && user.technicalInterviewId !== session.id) {
      throw new ForbiddenException('Access denied for this assessment.');
    }

    if (session.attempt_status === 'NOT_STARTED') {
      throw new BadRequestException(
        'Start the assessment before uploading the candidate recording.',
      );
    }

    if (!file) {
      throw new BadRequestException('Recording file is required.');
    }

    const storedPath = await this.storage.saveUpload(
      file,
      `technical/${id}/${file.filename}`,
    );

    const recording = await this.prisma.technicalInterviewRecording.create({
      data: {
        technical_interview_id: id,
        recorded_by_id: user.userId,
        label: meta.label?.trim() || 'Candidate face recording',
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
      streamUrl: `/api/v1/technical-interviews/${id}/recordings/${recording.id}/stream`,
    };
  }

  async getRecordingFile(id: string, recordingId: string, user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException(
        'Candidates cannot stream assessment recordings.',
      );
    }

    await this.context.findAccessible(id, user);

    const recording = await this.prisma.technicalInterviewRecording.findFirst({
      where: { id: recordingId, technical_interview_id: id },
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

  async listForSession(id: string, user: AuthUser) {
    if (user.isGuest) {
      return [];
    }

    await this.context.findAccessible(id, user);

    const recordings = await this.prisma.technicalInterviewRecording.findMany({
      where: { technical_interview_id: id },
      include: {
        recordedBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return recordings.map((recording) => ({
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
      streamUrl: `/api/v1/technical-interviews/${id}/recordings/${recording.id}/stream`,
    }));
  }
}
