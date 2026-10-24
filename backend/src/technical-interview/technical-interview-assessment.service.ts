import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  InterviewStatus,
  InterviewType,
  TechnicalAttemptStatus,
} from '@prisma/client';
import { requireCompanyContext } from '../common/company-scope';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { interviewerRoleWhere } from '../common/interview-scope';
import { MailService } from '../common/mail.service';
import { assertInterviewerFree } from '../common/interviewer-schedule';
import { resolveInterviewWindow } from '../common/interview-window';
import { generateInviteToken } from '../common/invite-token';
import { PrismaService } from '../prisma/prisma.service';
import {
  technicalInterviewDetailInclude,
  TechnicalInterviewContextService,
} from './technical-interview-context.service';
import {
  CreateTechnicalInterviewDto,
  UpdateTechnicalInterviewDto,
} from './dto/technical-interview.dto';
import { TechnicalInterviewAttemptService } from './technical-interview-attempt.service';
import { TechnicalInterviewRecordingService } from './technical-interview-recording.service';

@Injectable()
export class TechnicalInterviewAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TechnicalInterviewContextService,
    private readonly recordingService: TechnicalInterviewRecordingService,
    private readonly attemptService: TechnicalInterviewAttemptService,
    private readonly mail: MailService,
  ) {}

  async list(user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException('Candidates can only use their invite link.');
    }
    if (!user.permissions.includes('TechnicalInterview.View')) {
      throw new ForbiddenException('Technical interview view permission required.');
    }

    const sessions = await this.prisma.technicalInterview.findMany({
      where: this.context.listWhere(user),
      include: technicalInterviewDetailInclude,
      orderBy: { interview: { scheduled_at: 'desc' } },
    });

    await Promise.all(
      sessions.map((s) => this.context.closeIfWindowExpired(s.interview)),
    );

    const refreshed = await this.prisma.technicalInterview.findMany({
      where: this.context.listWhere(user),
      include: technicalInterviewDetailInclude,
      orderBy: { interview: { scheduled_at: 'desc' } },
    });

    return refreshed.map((s) => this.context.mapSession(s, true));
  }

  async getById(id: string, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    await this.context.closeIfWindowExpired(session.interview);
    const fresh = await this.context.findAccessible(id, user);
    const includeAnswerKey = !user.isGuest;
    const recordings = includeAnswerKey
      ? await this.recordingService.listForSession(id, user)
      : [];
    const integrityEvents = includeAnswerKey
      ? await this.attemptService.listIntegrityEvents(id)
      : [];
    return this.context.mapSession(
      fresh,
      includeAnswerKey,
      recordings,
      integrityEvents,
    );
  }

  async create(dto: CreateTechnicalInterviewDto, user: AuthUser) {
    this.context.assertCanCreate(user);
    const companyId = requireCompanyContext(user);
    const window = this.resolveWindow(dto.scheduledAt, dto.endsAt);
    const questions = await this.loadQuestions(dto.questionIds, companyId);
    const candidate = await this.resolveCandidate(dto, companyId);
    const inviteToken = generateInviteToken();
    const maxScore = questions.reduce((sum, q) => sum + q.points, 0);

    await assertInterviewerFree(this.prisma, {
      interviewerId: dto.interviewerId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const interview = await tx.interview.create({
        data: {
          company_id: companyId,
          title: dto.title,
          type: InterviewType.TECHNICAL,
          status: InterviewStatus.SCHEDULED,
          scheduled_at: window.startsAt,
          ends_at: window.endsAt,
          duration_minutes: dto.timeLimitMinutes,
          candidate_id: candidate.id,
          interviewer_id: dto.interviewerId,
          created_by_id: user.userId,
          notes: dto.notes,
        },
      });

      return tx.technicalInterview.create({
        data: {
          interview_id: interview.id,
          invite_token: inviteToken,
          time_limit_minutes: dto.timeLimitMinutes,
          instructions: dto.instructions,
          max_score: maxScore,
          questions: {
            create: questions.map((q, index) => ({
              question_id: q.id,
              sort_order: index,
              points: q.points,
            })),
          },
        },
        include: technicalInterviewDetailInclude,
      });
    });

    await this.mail.sendInterviewEmail({
      to: created.interview.candidate.email,
      candidateName: `${created.interview.candidate.first_name} ${created.interview.candidate.last_name}`,
      title: created.interview.title,
      startsAt: created.interview.scheduled_at,
      endsAt: created.interview.ends_at,
      kind: 'scheduled',
      technicalToken: created.invite_token,
    });

    return this.context.mapSession(created, true);
  }

  async update(id: string, dto: UpdateTechnicalInterviewDto, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCanManage(session, user);
    if (
      session.interview.status !== InterviewStatus.SCHEDULED &&
      session.attempt_status !== TechnicalAttemptStatus.NOT_STARTED
    ) {
      throw new BadRequestException(
        'Only unstarted assessments can be edited.',
      );
    }

    const window =
      dto.scheduledAt || dto.endsAt
        ? this.resolveWindow(
            dto.scheduledAt ?? session.interview.scheduled_at.toISOString(),
            dto.endsAt ?? session.interview.ends_at.toISOString(),
          )
        : null;

    if (window || dto.interviewerId) {
      await assertInterviewerFree(this.prisma, {
        interviewerId: dto.interviewerId ?? session.interview.interviewer_id,
        startsAt: window?.startsAt ?? session.interview.scheduled_at,
        endsAt: window?.endsAt ?? session.interview.ends_at,
        exceptInterviewId: session.interview_id,
      });
    }

    const questions =
      dto.questionIds && dto.questionIds.length > 0
        ? await this.loadQuestions(
            dto.questionIds,
            session.interview.company_id,
          )
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.candidateEmail) {
        await tx.candidate.update({
          where: { id: session.interview.candidate_id },
          data: {
            first_name: dto.candidateFirstName,
            last_name: dto.candidateLastName,
            email: dto.candidateEmail.toLowerCase(),
          },
        });
      }

      await tx.interview.update({
        where: { id: session.interview_id },
        data: {
          title: dto.title,
          scheduled_at: window?.startsAt,
          ends_at: window?.endsAt,
          duration_minutes: dto.timeLimitMinutes,
          interviewer_id: dto.interviewerId,
          notes: dto.notes,
          status: InterviewStatus.SCHEDULED,
        },
      });

      if (questions) {
        await tx.technicalInterviewQuestion.deleteMany({
          where: { technical_interview_id: session.id },
        });
        await tx.technicalInterviewQuestion.createMany({
          data: questions.map((q, index) => ({
            technical_interview_id: session.id,
            question_id: q.id,
            sort_order: index,
            points: q.points,
          })),
        });
      }

      const maxScore = questions
        ? questions.reduce((sum, q) => sum + q.points, 0)
        : undefined;

      return tx.technicalInterview.update({
        where: { id: session.id },
        data: {
          time_limit_minutes: dto.timeLimitMinutes,
          instructions: dto.instructions,
          max_score: maxScore,
        },
        include: technicalInterviewDetailInclude,
      });
    });

    if (window || dto.title) {
      await this.mail.sendInterviewEmail({
        to: updated.interview.candidate.email,
        candidateName: `${updated.interview.candidate.first_name} ${updated.interview.candidate.last_name}`,
        title: updated.interview.title,
        startsAt: updated.interview.scheduled_at,
        endsAt: updated.interview.ends_at,
        kind: 'updated',
        technicalToken: updated.invite_token,
      });
    }

    return this.context.mapSession(updated, true);
  }

  async remove(id: string, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCanManage(session, user);
    if (session.attempt_status === TechnicalAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Cannot delete an in-progress assessment.',
      );
    }
    await this.prisma.interview.delete({ where: { id: session.interview_id } });
    return { deleted: true, id };
  }

  async regenerateInvite(id: string, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCanManage(session, user);
    const inviteToken = generateInviteToken();
    const updated = await this.prisma.technicalInterview.update({
      where: { id },
      data: { invite_token: inviteToken },
      include: technicalInterviewDetailInclude,
    });
    return this.context.mapSession(updated, true);
  }

  async interviewers(user: AuthUser) {
    const companyId = requireCompanyContext(user);
    const rows = await this.prisma.user.findMany({
      where: {
        company_id: companyId,
        status: 'ACTIVE',
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

  private async loadQuestions(ids: string[], companyId: string) {
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids }, company_id: companyId },
    });
    if (questions.length !== ids.length) {
      throw new BadRequestException(
        'One or more selected questions were not found.',
      );
    }
    return ids
      .map((id) => questions.find((q) => q.id === id)!)
      .filter(Boolean);
  }

  private async resolveCandidate(
    dto: CreateTechnicalInterviewDto | UpdateTechnicalInterviewDto,
    companyId: string,
  ) {
    if (!dto.candidateEmail || !dto.candidateFirstName || !dto.candidateLastName) {
      throw new BadRequestException('Candidate details are required.');
    }
    const linkedUser = await this.prisma.user.findUnique({
      where: { email: dto.candidateEmail.toLowerCase() },
    });
    return this.prisma.candidate.upsert({
      where: {
        company_id_email: {
          company_id: companyId,
          email: dto.candidateEmail.toLowerCase(),
        },
      },
      update: {
        first_name: dto.candidateFirstName,
        last_name: dto.candidateLastName,
        user_id: linkedUser?.id,
      },
      create: {
        company_id: companyId,
        email: dto.candidateEmail.toLowerCase(),
        first_name: dto.candidateFirstName,
        last_name: dto.candidateLastName,
        user_id: linkedUser?.id,
      },
    });
  }

  private resolveWindow(scheduledAt: string, endsAt: string) {
    return resolveInterviewWindow(scheduledAt, endsAt, {
      invalidDatesMessage: 'Invalid assessment window dates.',
      invalidRangeMessage: 'End time must be after start time.',
    });
  }
}
