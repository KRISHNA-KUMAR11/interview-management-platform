import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InterviewStatus,
  InterviewType,
  Prisma,
  TechnicalAttemptStatus,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { isBroadStaffRole } from '../common/interview-scope';
import {
  assertInterviewWindowOpen,
  InterviewWindowLike,
  InterviewWindowMessages,
  isInterviewWindowExpired,
} from '../common/interview-window';
import { PrismaService } from '../prisma/prisma.service';

export const technicalInterviewDetailInclude = {
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
    },
  },
  questions: {
    include: { question: true },
    orderBy: { sort_order: 'asc' as const },
  },
  answers: true,
} satisfies Prisma.TechnicalInterviewInclude;

export type TechnicalInterviewDetail = Prisma.TechnicalInterviewGetPayload<{
  include: typeof technicalInterviewDetailInclude;
}>;

/** A closed interview is intentionally not rejected here: only the invite and
 * attempt flows decide what an already submitted assessment may still do. */
const ASSESSMENT_WINDOW_MESSAGES: InterviewWindowMessages = {
  opensAt: (opensAt) => `This assessment opens at ${opensAt.toLocaleString()}.`,
  closedAt: (closedAt) =>
    `This assessment closed at ${closedAt.toLocaleString()}.`,
};

@Injectable()
export class TechnicalInterviewContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async findAccessible(id: string, user: AuthUser) {
    const session = await this.prisma.technicalInterview.findUnique({
      where: { id },
      include: technicalInterviewDetailInclude,
    });
    if (!session) {
      throw new NotFoundException('Technical interview not found.');
    }

    if (user.isGuest) {
      if (user.technicalInterviewId !== session.id) {
        throw new ForbiddenException('Access denied for this assessment.');
      }
      return session;
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.companyId &&
      session.interview.company_id !== user.companyId
    ) {
      throw new ForbiddenException('Access denied for this assessment.');
    }

    const canSee =
      isBroadStaffRole(user.role) ||
      session.interview.interviewer_id === user.userId ||
      session.interview.candidate.user_id === user.userId;

    if (!canSee) {
      throw new ForbiddenException('Access denied for this assessment.');
    }
    return session;
  }

  findSessionOrThrow(id: string) {
    return this.prisma.technicalInterview.findUniqueOrThrow({
      where: { id },
      include: technicalInterviewDetailInclude,
    });
  }

  listWhere(user: AuthUser): Prisma.TechnicalInterviewWhereInput {
    const base: Prisma.TechnicalInterviewWhereInput = {
      interview: {
        type: InterviewType.TECHNICAL,
        ...(user.role === 'SUPER_ADMIN'
          ? {}
          : { company_id: user.companyId ?? undefined }),
      },
    };

    if (isBroadStaffRole(user.role)) {
      return base;
    }

    return {
      interview: {
        type: InterviewType.TECHNICAL,
        company_id: user.companyId ?? undefined,
        OR: [
          { interviewer_id: user.userId },
          { candidate: { user_id: user.userId } },
        ],
      },
    };
  }

  assertWindowOpen(interview: InterviewWindowLike) {
    assertInterviewWindowOpen(interview, ASSESSMENT_WINDOW_MESSAGES);
  }

  async closeIfWindowExpired(interview: {
    id: string;
    status: InterviewStatus;
    ends_at: Date;
  }) {
    if (!isInterviewWindowExpired(interview)) return;

    const tech = await this.prisma.technicalInterview.findUnique({
      where: { interview_id: interview.id },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id: interview.id },
        data: {
          status:
            tech?.attempt_status === TechnicalAttemptStatus.IN_PROGRESS
              ? InterviewStatus.COMPLETED
              : InterviewStatus.CANCELLED,
        },
      });
      if (tech && tech.attempt_status === TechnicalAttemptStatus.IN_PROGRESS) {
        await tx.technicalInterview.update({
          where: { id: tech.id },
          data: {
            attempt_status: TechnicalAttemptStatus.EXPIRED,
            submitted_at: new Date(),
          },
        });
      } else if (
        tech &&
        tech.attempt_status === TechnicalAttemptStatus.NOT_STARTED
      ) {
        await tx.technicalInterview.update({
          where: { id: tech.id },
          data: { attempt_status: TechnicalAttemptStatus.EXPIRED },
        });
      }
    });
  }

  assertNotSubmitted(session: { attempt_status: TechnicalAttemptStatus }) {
    if (
      session.attempt_status === TechnicalAttemptStatus.SUBMITTED ||
      session.attempt_status === TechnicalAttemptStatus.REVIEWED
    ) {
      throw new BadRequestException(
        'This assessment has already been submitted.',
      );
    }
  }

  assertInProgress(session: { attempt_status: TechnicalAttemptStatus }) {
    if (session.attempt_status !== TechnicalAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Start the assessment before answering.');
    }
  }

  assertNotTimedOut(session: {
    started_at: Date | null;
    time_limit_minutes: number;
  }) {
    if (!session.started_at) return;
    const deadline =
      session.started_at.getTime() + session.time_limit_minutes * 60_000;
    if (Date.now() > deadline) {
      throw new BadRequestException('Time limit exceeded for this assessment.');
    }
  }

  assertCandidateAccess(
    session: {
      interview: { candidate: { user_id: string | null } };
    },
    user: AuthUser,
  ) {
    if (user.isGuest) return;
    if (session.interview.candidate.user_id !== user.userId) {
      if (!user.permissions.includes('TechnicalInterview.Take')) {
        throw new ForbiddenException('Only the assigned candidate can take this.');
      }
      throw new ForbiddenException('Only the assigned candidate can take this.');
    }
  }

  assertCanCreate(user: AuthUser) {
    if (user.isGuest) throw new ForbiddenException('Guests cannot create.');
    if (!user.permissions.includes('TechnicalInterview.Create')) {
      throw new ForbiddenException('Create permission required.');
    }
  }

  assertCanManage(
    session: { interview: { company_id: string; created_by_id: string } },
    user: AuthUser,
  ) {
    if (user.isGuest) throw new ForbiddenException('Guests cannot manage.');
    if (
      user.permissions.includes('Interview.Edit') ||
      user.permissions.includes('TechnicalInterview.Create') ||
      isBroadStaffRole(user.role)
    ) {
      return;
    }
    throw new ForbiddenException('Manage permission required.');
  }

  candidateUrl(token: string) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    return `${frontendUrl.replace(/\/$/, '')}/tech-join/${token}`;
  }

  mapSession(
    session: TechnicalInterviewDetail,
    includeAnswerKey: boolean,
    recordings: Array<{
      id: string;
      label: string;
      mimeType: string;
      sizeBytes: number;
      durationSeconds: number | null;
      createdAt: Date;
      recordedBy: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
      streamUrl: string;
    }> = [],
  ) {
    const remainingSeconds = session.started_at
      ? Math.max(
          0,
          Math.floor(
            (session.started_at.getTime() +
              session.time_limit_minutes * 60_000 -
              Date.now()) /
              1000,
          ),
        )
      : session.time_limit_minutes * 60;

    return {
      id: session.id,
      inviteToken: session.invite_token,
      candidateJoinUrl: this.candidateUrl(session.invite_token),
      timeLimitMinutes: session.time_limit_minutes,
      instructions: session.instructions,
      attemptStatus: session.attempt_status,
      startedAt: session.started_at,
      submittedAt: session.submitted_at,
      totalScore: session.total_score,
      maxScore: session.max_score,
      remainingSeconds,
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
      },
      questions: session.questions.map((link) => {
        const options = link.question.options_json
          ? (JSON.parse(link.question.options_json) as Array<{
              id: string;
              text: string;
              isCorrect?: boolean;
            }>)
          : [];
        return {
          id: link.id,
          questionId: link.question_id,
          sortOrder: link.sort_order,
          points: link.points,
          question: {
            id: link.question.id,
            title: link.question.title,
            body: link.question.body,
            type: link.question.type,
            difficulty: link.question.difficulty,
            language: link.question.language,
            starterCode: link.question.starter_code,
            options: includeAnswerKey
              ? options
              : options.map(({ id, text }) => ({ id, text })),
          },
        };
      }),
      answers: session.answers.map((answer) => ({
        id: answer.id,
        questionId: answer.question_id,
        answerText: answer.answer_text,
        selectedOptionId: answer.selected_option_id,
        code: answer.code,
        score:
          includeAnswerKey ||
          session.attempt_status === TechnicalAttemptStatus.REVIEWED
            ? answer.score
            : null,
        feedback:
          includeAnswerKey ||
          session.attempt_status === TechnicalAttemptStatus.REVIEWED
            ? answer.feedback
            : null,
      })),
      recordings: includeAnswerKey ? recordings : [],
    };
  }
}
