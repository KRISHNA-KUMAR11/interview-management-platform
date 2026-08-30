import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InterviewStatus,
  InterviewType,
  ParticipantRole,
  Prisma,
} from '@prisma/client';
import { requireCompanyContext } from '../common/company-scope';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../common/dto/pagination.dto';
import { assertPermission, interviewScopeWhere, interviewerRoleWhere } from '../common/interview-scope';
import { resolveInterviewWindow } from '../common/interview-window';
import { generateInviteToken, generateRoomCode } from '../common/invite-token';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInterviewDto,
  ListInterviewsQueryDto,
  UpdateInterviewDto,
} from './dto/interview.dto';

const OPEN_STATUSES: InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.WAITING,
  InterviewStatus.IN_PROGRESS,
];

type InterviewDetail = Prisma.InterviewGetPayload<{
  include: {
    candidate: true;
    interviewer: {
      select: { id: true; first_name: true; last_name: true; email: true };
    };
    createdBy: { select: { id: true; first_name: true; last_name: true } };
    liveSession: {
      select: { id: true; room_code: true; invite_token: true };
    };
    technicalSession: {
      select: {
        id: true;
        invite_token: true;
        attempt_status: true;
        total_score: true;
        max_score: true;
        time_limit_minutes: true;
      };
    };
    feedback: { select: { id: true; rating: true; recommendation: true } };
  };
}>;

@Injectable()
export class InterviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthUser) {
    assertPermission(user, 'Interview.View');
    const where = this.scopeWhere(user);

    const [grouped, total, todayCount] = await Promise.all([
      this.prisma.interview.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.interview.count({ where }),
      this.prisma.interview.count({
        where: {
          ...where,
          status: { in: OPEN_STATUSES },
          scheduled_at: {
            gte: this.startOfToday(),
            lt: this.startOfTomorrow(),
          },
        },
      }),
    ]);

    const byStatus = (status: InterviewStatus) =>
      grouped.find((row) => row.status === status)?._count._all ?? 0;

    return {
      total,
      scheduled: byStatus(InterviewStatus.SCHEDULED),
      waiting: byStatus(InterviewStatus.WAITING),
      inProgress: byStatus(InterviewStatus.IN_PROGRESS),
      completed: byStatus(InterviewStatus.COMPLETED),
      cancelled: byStatus(InterviewStatus.CANCELLED),
      today: todayCount,
    };
  }

  async list(user: AuthUser, filters: ListInterviewsQueryDto = {}) {
    assertPermission(user, 'Interview.View');

    const where: Prisma.InterviewWhereInput = { ...this.scopeWhere(user) };
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;

    const term = filters.search?.trim();
    if (term) {
      where.OR = [
        { title: { contains: term } },
        { candidate: { first_name: { contains: term } } },
        { candidate: { last_name: { contains: term } } },
        { candidate: { email: { contains: term } } },
      ];
    }

    if (!isPaginationRequested(filters)) {
      const interviews = await this.prisma.interview.findMany({
        where,
        include: this.detailInclude(),
        orderBy: { scheduled_at: 'desc' },
      });

      return interviews.map((interview) => this.mapInterview(interview));
    }

    const pagination = resolvePagination(filters);
    const [total, interviews] = await Promise.all([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        include: this.detailInclude(),
        orderBy: { scheduled_at: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return buildPaginatedResult(
      interviews.map((interview) => this.mapInterview(interview)),
      total,
      pagination,
    );
  }

  async getById(id: string, user: AuthUser) {
    assertPermission(user, 'Interview.View');
    const interview = await this.findAccessible(id, user);
    return this.mapInterview(interview);
  }

  async listInterviewers(user: AuthUser) {
    assertPermission(user, 'Interview.View');
    const rows = await this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(user.role === 'SUPER_ADMIN'
          ? {}
          : { company_id: user.companyId ?? undefined }),
        role: interviewerRoleWhere(),
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: { select: { display_name: true } },
      },
      orderBy: { first_name: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      role: { displayName: row.role.display_name },
    }));
  }

  async create(dto: CreateInterviewDto, user: AuthUser) {
    assertPermission(user, 'Interview.Create');
    const companyId = requireCompanyContext(user);
    const window = this.resolveWindow(dto.scheduledAt, dto.endsAt);

    const interviewer = await this.prisma.user.findUnique({
      where: { id: dto.interviewerId },
    });
    if (!interviewer) throw new NotFoundException('Interviewer not found.');
    if (
      interviewer.company_id &&
      user.companyId &&
      interviewer.company_id !== user.companyId
    ) {
      throw new ForbiddenException(
        'Interviewer must belong to the same company.',
      );
    }

    const candidate = await this.resolveCandidate(dto, companyId);
    const needsLive =
      dto.type === InterviewType.LIVE || dto.type === InterviewType.COMBINED;
    const needsTechnical =
      dto.type === InterviewType.TECHNICAL ||
      dto.type === InterviewType.COMBINED;

    const questions = needsTechnical
      ? await this.loadQuestions(dto.questionIds ?? [], companyId)
      : [];

    if (needsTechnical && questions.length === 0) {
      throw new BadRequestException(
        'Select at least one question from the question bank for a technical assessment.',
      );
    }

    const timeLimitMinutes = Math.min(
      300,
      Math.max(5, dto.timeLimitMinutes ?? window.durationMinutes),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          company_id: companyId,
          title: dto.title,
          type: dto.type,
          status: InterviewStatus.SCHEDULED,
          scheduled_at: window.startsAt,
          ends_at: window.endsAt,
          duration_minutes: window.durationMinutes,
          candidate_id: candidate.id,
          interviewer_id: dto.interviewerId,
          created_by_id: user.userId,
          notes: dto.notes,
        },
      });

      if (needsLive) {
        await tx.liveInterview.create({
          data: {
            interview_id: interview.id,
            room_code: generateRoomCode(),
            invite_token: generateInviteToken(),
            recording_enabled: dto.recordingEnabled ?? false,
            participants: {
              create: [
                {
                  user_id: dto.interviewerId,
                  role: ParticipantRole.INTERVIEWER,
                },
                ...(candidate.user_id
                  ? [
                      {
                        user_id: candidate.user_id,
                        role: ParticipantRole.CANDIDATE,
                      },
                    ]
                  : []),
              ],
            },
          },
        });
      }

      if (needsTechnical) {
        await tx.technicalInterview.create({
          data: {
            interview_id: interview.id,
            invite_token: generateInviteToken(),
            time_limit_minutes: timeLimitMinutes,
            instructions: dto.instructions,
            max_score: questions.reduce((sum, q) => sum + q.points, 0),
            questions: {
              create: questions.map((question, index) => ({
                question_id: question.id,
                sort_order: index,
                points: question.points,
              })),
            },
          },
        });
      }

      return tx.interview.findUniqueOrThrow({
        where: { id: interview.id },
        include: this.detailInclude(),
      });
    });

    return this.mapInterview(created);
  }

  async update(id: string, dto: UpdateInterviewDto, user: AuthUser) {
    assertPermission(user, 'Interview.Edit');
    const existing = await this.findAccessible(id, user);

    const window =
      dto.scheduledAt || dto.endsAt
        ? this.resolveWindow(
            dto.scheduledAt ?? existing.scheduled_at.toISOString(),
            dto.endsAt ?? existing.ends_at.toISOString(),
          )
        : null;

    if (dto.interviewerId && dto.interviewerId !== existing.interviewer_id) {
      const interviewer = await this.prisma.user.findUnique({
        where: { id: dto.interviewerId },
      });
      if (!interviewer) throw new NotFoundException('Interviewer not found.');
      if (
        interviewer.company_id &&
        existing.company_id !== interviewer.company_id
      ) {
        throw new ForbiddenException(
          'Interviewer must belong to the same company.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id },
        data: {
          title: dto.title,
          notes: dto.notes,
          status: dto.status,
          interviewer_id: dto.interviewerId,
          scheduled_at: window?.startsAt,
          ends_at: window?.endsAt,
          duration_minutes: window?.durationMinutes,
        },
      });

      if (dto.interviewerId && existing.liveSession) {
        await tx.liveInterviewParticipant.upsert({
          where: {
            live_interview_id_user_id: {
              live_interview_id: existing.liveSession.id,
              user_id: dto.interviewerId,
            },
          },
          create: {
            live_interview_id: existing.liveSession.id,
            user_id: dto.interviewerId,
            role: ParticipantRole.INTERVIEWER,
          },
          update: { role: ParticipantRole.INTERVIEWER, left_at: null },
        });
      }

      return tx.interview.findUniqueOrThrow({
        where: { id },
        include: this.detailInclude(),
      });
    });

    return this.mapInterview(updated);
  }

  async cancel(id: string, user: AuthUser) {
    assertPermission(user, 'Interview.Edit');
    const existing = await this.findAccessible(id, user);

    if (existing.status === InterviewStatus.COMPLETED) {
      throw new BadRequestException('Completed interviews cannot be cancelled.');
    }

    const updated = await this.prisma.interview.update({
      where: { id },
      data: { status: InterviewStatus.CANCELLED },
      include: this.detailInclude(),
    });

    return this.mapInterview(updated);
  }

  async remove(id: string, user: AuthUser) {
    assertPermission(user, 'Interview.Delete');
    await this.findAccessible(id, user);
    await this.prisma.interview.delete({ where: { id } });
    return { deleted: true, id };
  }

  private detailInclude() {
    return {
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
        select: { id: true, first_name: true, last_name: true },
      },
      liveSession: {
        select: { id: true, room_code: true, invite_token: true },
      },
      technicalSession: {
        select: {
          id: true,
          invite_token: true,
          attempt_status: true,
          total_score: true,
          max_score: true,
          time_limit_minutes: true,
        },
      },
      feedback: { select: { id: true, rating: true, recommendation: true } },
    };
  }

  private mapInterview(interview: InterviewDetail) {
    const now = Date.now();
    const isOpen =
      OPEN_STATUSES.includes(interview.status) &&
      interview.scheduled_at.getTime() <= now &&
      interview.ends_at.getTime() > now;

    return {
      id: interview.id,
      title: interview.title,
      type: interview.type,
      status: interview.status,
      scheduledAt: interview.scheduled_at,
      endsAt: interview.ends_at,
      durationMinutes: interview.duration_minutes,
      notes: interview.notes,
      windowOpen: isOpen,
      candidate: {
        id: interview.candidate.id,
        firstName: interview.candidate.first_name,
        lastName: interview.candidate.last_name,
        email: interview.candidate.email,
        phone: interview.candidate.phone,
      },
      interviewer: {
        id: interview.interviewer.id,
        firstName: interview.interviewer.first_name,
        lastName: interview.interviewer.last_name,
        email: interview.interviewer.email,
      },
      createdBy: {
        id: interview.createdBy.id,
        firstName: interview.createdBy.first_name,
        lastName: interview.createdBy.last_name,
      },
      liveSession: interview.liveSession
        ? {
            id: interview.liveSession.id,
            roomCode: interview.liveSession.room_code,
            inviteToken: interview.liveSession.invite_token,
          }
        : interview.liveSession,
      technicalSession: interview.technicalSession
        ? {
            id: interview.technicalSession.id,
            inviteToken: interview.technicalSession.invite_token,
            attemptStatus: interview.technicalSession.attempt_status,
            totalScore: interview.technicalSession.total_score,
            maxScore: interview.technicalSession.max_score,
            timeLimitMinutes: interview.technicalSession.time_limit_minutes,
          }
        : interview.technicalSession,
      feedbackCount: interview.feedback.length,
      averageRating: interview.feedback.length
        ? Number(
            (
              interview.feedback.reduce((sum, f) => sum + f.rating, 0) /
              interview.feedback.length
            ).toFixed(1),
          )
        : null,
      createdAt: interview.created_at,
      updatedAt: interview.updated_at,
    };
  }

  private async resolveCandidate(dto: CreateInterviewDto, companyId: string) {
    if (dto.candidateId) {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: dto.candidateId },
      });
      if (!candidate) throw new NotFoundException('Candidate not found.');
      if (candidate.company_id !== companyId) {
        throw new ForbiddenException('Candidate belongs to another company.');
      }
      return candidate;
    }

    if (!dto.candidateEmail || !dto.candidateFirstName) {
      throw new BadRequestException(
        'Select an existing candidate or provide candidate name and email.',
      );
    }

    const email = dto.candidateEmail.toLowerCase();
    const linkedUser = await this.prisma.user.findUnique({ where: { email } });

    return this.prisma.candidate.upsert({
      where: { company_id_email: { company_id: companyId, email } },
      create: {
        company_id: companyId,
        email,
        first_name: dto.candidateFirstName,
        last_name: dto.candidateLastName ?? '',
        user_id: linkedUser?.id,
      },
      update: {
        first_name: dto.candidateFirstName,
        last_name: dto.candidateLastName ?? '',
        user_id: linkedUser?.id,
      },
    });
  }

  private async loadQuestions(questionIds: string[], companyId: string) {
    if (questionIds.length === 0) return [];
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, company_id: companyId },
    });
    if (questions.length !== questionIds.length) {
      throw new BadRequestException(
        'One or more questions are unavailable for this company.',
      );
    }
    return questionIds.map(
      (id) => questions.find((question) => question.id === id)!,
    );
  }

  private async findAccessible(id: string, user: AuthUser) {
    const interview = await this.prisma.interview.findUnique({
      where: { id },
      include: this.detailInclude(),
    });

    if (!interview) throw new NotFoundException('Interview not found.');

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.companyId &&
      interview.company_id !== user.companyId
    ) {
      throw new ForbiddenException('Access denied for this interview.');
    }

    return interview;
  }

  private resolveWindow(scheduledAt: string, endsAt: string) {
    return resolveInterviewWindow(scheduledAt, endsAt, {
      invalidDatesMessage: 'Invalid interview window dates.',
      invalidRangeMessage: 'End date/time must be after the start date/time.',
      minDurationMinutes: 5,
      maxDurationMinutes: 600,
    });
  }

  private scopeWhere(user: AuthUser): Prisma.InterviewWhereInput {
    return interviewScopeWhere(user);
  }

  private startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfTomorrow() {
    const date = this.startOfToday();
    date.setDate(date.getDate() + 1);
    return date;
  }
}
