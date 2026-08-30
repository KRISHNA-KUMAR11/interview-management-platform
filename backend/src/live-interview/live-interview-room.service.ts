import { BadRequestException, Injectable } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  liveInterviewDetailInclude,
  LiveInterviewContextService,
} from './live-interview-context.service';
import { MediaCheckDto } from './dto/live-interview.dto';

@Injectable()
export class LiveInterviewRoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: LiveInterviewContextService,
  ) {}

  async join(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    await this.context.closeInterviewIfWindowExpired(session.interview);
    const live = await this.context.findSessionOrThrow(session.id);
    this.context.assertInviteWindowOpen(live.interview);

    if (
      live.interview.status === InterviewStatus.COMPLETED ||
      live.interview.status === InterviewStatus.CANCELLED
    ) {
      throw new BadRequestException('This interview is no longer joinable.');
    }

    const existing = live.participants.find((p) => p.user_id === user.userId);

    if (!existing) {
      const role = this.context.resolveJoinRole(live, user);
      await this.prisma.liveInterviewParticipant.create({
        data: {
          live_interview_id: live.id,
          user_id: user.userId,
          role,
          joined_at: new Date(),
        },
      });
    } else {
      await this.prisma.liveInterviewParticipant.update({
        where: { id: existing.id },
        data: { joined_at: new Date(), left_at: null },
      });
    }

    if (live.interview.status === InterviewStatus.SCHEDULED) {
      await this.prisma.interview.update({
        where: { id: live.interview_id },
        data: { status: InterviewStatus.WAITING },
      });
    }

    const refreshed = await this.context.findAccessibleSession(id, user);
    return this.context.mapSession(refreshed);
  }

  async mediaCheck(id: string, user: AuthUser, dto: MediaCheckDto) {
    await this.context.findAccessibleSession(id, user);

    const participant = await this.prisma.liveInterviewParticipant.findUnique({
      where: {
        live_interview_id_user_id: {
          live_interview_id: id,
          user_id: user.userId,
        },
      },
    });

    if (!participant) {
      throw new BadRequestException('Join the interview before media check.');
    }

    const updated = await this.prisma.liveInterviewParticipant.update({
      where: { id: participant.id },
      data: {
        camera_ok: dto.cameraOk,
        microphone_ok: dto.microphoneOk,
        media_check_passed: dto.cameraOk && dto.microphoneOk,
      },
    });

    return {
      cameraOk: updated.camera_ok,
      microphoneOk: updated.microphone_ok,
      mediaCheckPassed: updated.media_check_passed,
    };
  }

  async start(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanControl(session, user);
    await this.context.closeInterviewIfWindowExpired(session.interview);
    const live = await this.context.findAccessibleSession(id, user);
    this.context.assertInviteWindowOpen(live.interview);

    if (live.interview.status === InterviewStatus.COMPLETED) {
      throw new BadRequestException('Interview is already completed.');
    }

    const participant = live.participants.find(
      (p) => p.user_id === user.userId,
    );
    if (!participant?.media_check_passed) {
      throw new BadRequestException(
        'Complete camera and microphone check before starting.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id: live.interview_id },
        data: { status: InterviewStatus.IN_PROGRESS },
      });

      await tx.liveInterviewEvent.create({
        data: {
          live_interview_id: live.id,
          actor_user_id: user.userId,
          event_type: 'started',
          message: 'Interview started',
        },
      });

      return tx.liveInterview.update({
        where: { id: live.id },
        data: {
          started_at: live.started_at ?? new Date(),
          is_recording: true,
        },
        include: liveInterviewDetailInclude,
      });
    });

    return this.context.mapSession(updated);
  }

  async complete(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanControl(session, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id: session.interview_id },
        data: { status: InterviewStatus.COMPLETED },
      });

      await tx.liveInterviewEvent.create({
        data: {
          live_interview_id: session.id,
          actor_user_id: user.userId,
          event_type: 'completed',
          message: 'Interview marked completed',
        },
      });

      return tx.liveInterview.update({
        where: { id: session.id },
        data: {
          ended_at: new Date(),
          is_recording: false,
        },
        include: liveInterviewDetailInclude,
      });
    });

    return this.context.mapSession(updated);
  }

  async leave(id: string, user: AuthUser) {
    const participant = await this.prisma.liveInterviewParticipant.findUnique({
      where: {
        live_interview_id_user_id: {
          live_interview_id: id,
          user_id: user.userId,
        },
      },
    });

    if (participant) {
      await this.prisma.liveInterviewParticipant.update({
        where: { id: participant.id },
        data: { left_at: new Date() },
      });
    }

    return { left: true };
  }

  async logEvent(
    id: string,
    user: AuthUser,
    eventType: string,
    message?: string,
  ) {
    await this.context.findAccessibleSession(id, user);
    const event = await this.prisma.liveInterviewEvent.create({
      data: {
        live_interview_id: id,
        actor_user_id: user.userId,
        event_type: eventType,
        message,
      },
    });
    return {
      id: event.id,
      liveInterviewId: event.live_interview_id,
      actorUserId: event.actor_user_id,
      eventType: event.event_type,
      message: event.message,
      createdAt: event.created_at,
    };
  }
}
