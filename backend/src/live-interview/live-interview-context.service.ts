import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InterviewStatus, ParticipantRole, Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { isBroadStaffRole } from '../common/interview-scope';
import {
  assertInterviewWindowOpen,
  formatWindowTime,
  InterviewWindowLike,
  InterviewWindowMessages,
  isInterviewWindowExpired,
} from '../common/interview-window';
import { PrismaService } from '../prisma/prisma.service';

export const liveInterviewDetailInclude = {
  interview: {
    include: {
      candidate: true,
      interviewer: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
      feedback: {
        include: {
          submittedBy: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      },
    },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.LiveInterviewInclude;

export type LiveInterviewDetail = Prisma.LiveInterviewGetPayload<{
  include: typeof liveInterviewDetailInclude;
}>;

const INVITE_WINDOW_MESSAGES: InterviewWindowMessages = {
  closed: 'This interview is closed. The invite link is no longer valid.',
  opensAt: (opensAt) =>
    `This interview link opens at ${formatWindowTime(opensAt)}. Please try again after that time.`,
  closedAt: (closedAt) =>
    `This interview window closed at ${formatWindowTime(closedAt)}. The link is no longer valid.`,
};

@Injectable()
export class LiveInterviewContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async findAccessibleSession(id: string, user: AuthUser) {
    const session = await this.prisma.liveInterview.findUnique({
      where: { id },
      include: liveInterviewDetailInclude,
    });

    if (!session) {
      throw new NotFoundException('Live interview not found.');
    }

    if (user.isGuest) {
      if (user.liveInterviewId !== session.id) {
        throw new ForbiddenException('Access denied for this interview.');
      }
      if (
        session.interview.status === InterviewStatus.COMPLETED ||
        session.interview.status === InterviewStatus.CANCELLED
      ) {
        throw new ForbiddenException(
          'This interview is completed. The invite link is no longer valid.',
        );
      }
      return session;
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.companyId &&
      session.interview.company_id !== user.companyId
    ) {
      throw new ForbiddenException('Access denied for this interview.');
    }

    const canSee =
      isBroadStaffRole(user.role) ||
      session.interview.interviewer_id === user.userId ||
      session.interview.candidate.user_id === user.userId ||
      session.participants.some((p) => p.user_id === user.userId);

    if (!canSee) {
      throw new ForbiddenException('Access denied for this interview.');
    }

    return session;
  }

  findSessionOrThrow(id: string) {
    return this.prisma.liveInterview.findUniqueOrThrow({
      where: { id },
      include: liveInterviewDetailInclude,
    });
  }

  assertCanControl(session: LiveInterviewDetail, user: AuthUser) {
    const allowed =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'COMPANY_ADMIN' ||
      user.role === 'HR' ||
      session.interview.interviewer_id === user.userId ||
      user.permissions.includes('Interview.Edit');

    if (!allowed) {
      throw new ForbiddenException(
        'Only the interviewer or HR can control this session.',
      );
    }
  }

  assertCanManage(session: LiveInterviewDetail, user: AuthUser) {
    const allowed =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'COMPANY_ADMIN' ||
      user.role === 'HR' ||
      session.interview.created_by_id === user.userId ||
      user.permissions.includes('Interview.Edit') ||
      user.permissions.includes('Interview.Delete');

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to manage this interview.',
      );
    }
  }

  resolveJoinRole(session: LiveInterviewDetail, user: AuthUser): ParticipantRole {
    if (session.interview.interviewer_id === user.userId) {
      return ParticipantRole.INTERVIEWER;
    }
    if (session.interview.candidate.user_id === user.userId) {
      return ParticipantRole.CANDIDATE;
    }
    if (isBroadStaffRole(user.role)) {
      return ParticipantRole.OBSERVER;
    }
    throw new ForbiddenException('You are not assigned to this interview.');
  }

  assertInviteWindowOpen(interview: InterviewWindowLike) {
    assertInterviewWindowOpen(interview, INVITE_WINDOW_MESSAGES);
  }

  async closeInterviewIfWindowExpired(interview: {
    id: string;
    status: InterviewStatus;
    ends_at: Date;
  }) {
    if (!isInterviewWindowExpired(interview)) {
      return interview;
    }

    const nextStatus =
      interview.status === InterviewStatus.IN_PROGRESS
        ? InterviewStatus.COMPLETED
        : InterviewStatus.CANCELLED;

    return this.prisma.interview.update({
      where: { id: interview.id },
      data: { status: nextStatus },
    });
  }

  visibilityFilter(user: AuthUser): Prisma.InterviewWhereInput[] {
    if (isBroadStaffRole(user.role)) {
      return [{}];
    }

    return [
      { interviewer_id: user.userId },
      { candidate: { user_id: user.userId } },
      {
        liveSession: {
          participants: { some: { user_id: user.userId } },
        },
      },
    ];
  }

  mapSession(session: LiveInterviewDetail) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const candidateJoinUrl = `${frontendUrl.replace(/\/$/, '')}/join/${session.invite_token}`;

    return {
      id: session.id,
      roomCode: session.room_code,
      inviteToken: session.invite_token,
      candidateJoinUrl,
      recordingEnabled: session.recording_enabled,
      isRecording: session.is_recording,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      interview: {
        id: session.interview.id,
        title: session.interview.title,
        status: session.interview.status,
        scheduledAt: session.interview.scheduled_at,
        endsAt: session.interview.ends_at,
        durationMinutes: session.interview.duration_minutes,
        notes: session.interview.notes,
        candidate: {
          id: session.interview.candidate.id,
          firstName: session.interview.candidate.first_name,
          lastName: session.interview.candidate.last_name,
          email: session.interview.candidate.email,
          userId: session.interview.candidate.user_id,
        },
        interviewer: {
          id: session.interview.interviewer.id,
          firstName: session.interview.interviewer.first_name,
          lastName: session.interview.interviewer.last_name,
          email: session.interview.interviewer.email,
        },
        createdBy: {
          id: session.interview.createdBy.id,
          firstName: session.interview.createdBy.first_name,
          lastName: session.interview.createdBy.last_name,
          email: session.interview.createdBy.email,
        },
        feedback: session.interview.feedback.map((item) => ({
          id: item.id,
          interviewId: item.interview_id,
          submittedById: item.submitted_by_id,
          rating: item.rating,
          recommendation: item.recommendation,
          strengths: item.strengths,
          weaknesses: item.weaknesses,
          comments: item.comments,
          submittedAt: item.submitted_at,
          submittedBy: {
            id: item.submittedBy.id,
            firstName: item.submittedBy.first_name,
            lastName: item.submittedBy.last_name,
          },
        })),
      },
      participants: session.participants.map((p) => ({
        id: p.id,
        role: p.role,
        cameraOk: p.camera_ok,
        microphoneOk: p.microphone_ok,
        mediaCheckPassed: p.media_check_passed,
        joinedAt: p.joined_at,
        leftAt: p.left_at,
        user: {
          id: p.user.id,
          firstName: p.user.first_name,
          lastName: p.user.last_name,
          email: p.user.email,
        },
      })),
    };
  }
}
