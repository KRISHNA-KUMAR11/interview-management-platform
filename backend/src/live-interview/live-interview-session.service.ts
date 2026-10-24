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
import { AuthUser } from '../common/decorators/current-user.decorator';
import { interviewerRoleWhere } from '../common/interview-scope';
import { generateInviteToken, generateRoomCode } from '../common/invite-token';
import { MailService } from '../common/mail.service';
import { assertInterviewerFree } from '../common/interviewer-schedule';
import { resolveInterviewWindow } from '../common/interview-window';
import { PrismaService } from '../prisma/prisma.service';
import {
  liveInterviewDetailInclude,
  LiveInterviewContextService,
} from './live-interview-context.service';
import {
  CreateLiveInterviewDto,
  UpdateLiveInterviewDto,
} from './dto/live-interview.dto';

@Injectable()
export class LiveInterviewSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: LiveInterviewContextService,
    private readonly mail: MailService,
  ) {}

  async list(user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException(
        'Candidates can only access their invite link.',
      );
    }

    const visibility = this.context.visibilityFilter(user);

    const where: Prisma.LiveInterviewWhereInput = {
      interview: {
        type: InterviewType.LIVE,
        AND: [
          user.role === 'SUPER_ADMIN'
            ? {}
            : { company_id: user.companyId ?? undefined },
          visibility.length === 1 && Object.keys(visibility[0]).length === 0
            ? {}
            : { OR: visibility },
        ],
      },
    };

    const sessions = await this.prisma.liveInterview.findMany({
      where,
      include: liveInterviewDetailInclude,
      orderBy: { interview: { scheduled_at: 'asc' } },
    });

    await Promise.all(
      sessions.map((session) =>
        this.context.closeInterviewIfWindowExpired(session.interview),
      ),
    );

    const refreshed = await this.prisma.liveInterview.findMany({
      where,
      include: liveInterviewDetailInclude,
      orderBy: { interview: { scheduled_at: 'asc' } },
    });

    return refreshed.map((session) => this.context.mapSession(session));
  }

  async getById(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    await this.context.closeInterviewIfWindowExpired(session.interview);
    const live = await this.context.findAccessibleSession(id, user);
    if (user.isGuest) {
      this.context.assertInviteWindowOpen(live.interview);
    }
    return this.context.mapSession(live);
  }

  async create(dto: CreateLiveInterviewDto, user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException('Guest candidates cannot create interviews.');
    }
    if (!user.companyId && user.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Company context is required.');
    }

    const interviewer = await this.prisma.user.findUnique({
      where: { id: dto.interviewerId },
      include: { role: true },
    });

    if (!interviewer) {
      throw new NotFoundException('Interviewer not found.');
    }

    const companyId = user.companyId ?? interviewer.company_id;
    if (!companyId) {
      throw new BadRequestException('Unable to resolve company for interview.');
    }

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
    const roomCode = generateRoomCode();
    const inviteToken = generateInviteToken();
    const window = this.resolveWindow(dto);

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
          type: InterviewType.LIVE,
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

      const live = await tx.liveInterview.create({
        data: {
          interview_id: interview.id,
          room_code: roomCode,
          invite_token: inviteToken,
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
        include: liveInterviewDetailInclude,
      });

      return live;
    });

    await this.mail.sendInterviewEmail({
      to: created.interview.candidate.email,
      candidateName: `${created.interview.candidate.first_name} ${created.interview.candidate.last_name}`,
      title: created.interview.title,
      startsAt: created.interview.scheduled_at,
      endsAt: created.interview.ends_at,
      kind: 'scheduled',
      liveToken: created.invite_token,
    });

    return this.context.mapSession(created);
  }

  async update(id: string, dto: UpdateLiveInterviewDto, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanManage(session, user);

    if (
      session.interview.status !== InterviewStatus.SCHEDULED &&
      session.interview.status !== InterviewStatus.WAITING
    ) {
      throw new BadRequestException('Only scheduled interviews can be edited.');
    }

    const window =
      dto.scheduledAt || dto.endsAt
        ? this.resolveWindow({
            scheduledAt:
              dto.scheduledAt ?? session.interview.scheduled_at.toISOString(),
            endsAt: dto.endsAt ?? session.interview.ends_at.toISOString(),
            durationMinutes: dto.durationMinutes,
          })
        : null;

    if (dto.interviewerId) {
      const interviewer = await this.prisma.user.findUnique({
        where: { id: dto.interviewerId },
      });
      if (!interviewer) {
        throw new NotFoundException('Interviewer not found.');
      }
      if (
        interviewer.company_id &&
        session.interview.company_id &&
        interviewer.company_id !== session.interview.company_id
      ) {
        throw new ForbiddenException(
          'Interviewer must belong to the same company.',
        );
      }
    }

    if (window || dto.interviewerId) {
      await assertInterviewerFree(this.prisma, {
        interviewerId: dto.interviewerId ?? session.interview.interviewer_id,
        startsAt: window?.startsAt ?? session.interview.scheduled_at,
        endsAt: window?.endsAt ?? session.interview.ends_at,
        exceptInterviewId: session.interview_id,
      });
    }

    const candidateUpdates: Prisma.CandidateUpdateInput = {};
    if (dto.candidateFirstName) {
      candidateUpdates.first_name = dto.candidateFirstName;
    }
    if (dto.candidateLastName) {
      candidateUpdates.last_name = dto.candidateLastName;
    }
    if (dto.candidateEmail) {
      const linkedUser = await this.prisma.user.findUnique({
        where: { email: dto.candidateEmail.toLowerCase() },
      });
      candidateUpdates.email = dto.candidateEmail.toLowerCase();
      candidateUpdates.user = linkedUser
        ? { connect: { id: linkedUser.id } }
        : { disconnect: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(candidateUpdates).length > 0) {
        await tx.candidate.update({
          where: { id: session.interview.candidate.id },
          data: candidateUpdates,
        });
      }

      if (
        dto.interviewerId &&
        dto.interviewerId !== session.interview.interviewer_id
      ) {
        await tx.liveInterviewParticipant.deleteMany({
          where: {
            live_interview_id: session.id,
            role: ParticipantRole.INTERVIEWER,
          },
        });
        await tx.liveInterviewParticipant.upsert({
          where: {
            live_interview_id_user_id: {
              live_interview_id: session.id,
              user_id: dto.interviewerId,
            },
          },
          create: {
            live_interview_id: session.id,
            user_id: dto.interviewerId,
            role: ParticipantRole.INTERVIEWER,
          },
          update: {
            role: ParticipantRole.INTERVIEWER,
            left_at: null,
          },
        });
      }

      if (dto.candidateEmail) {
        const linkedUser = await tx.user.findUnique({
          where: { email: dto.candidateEmail.toLowerCase() },
        });
        if (linkedUser) {
          await tx.liveInterviewParticipant.upsert({
            where: {
              live_interview_id_user_id: {
                live_interview_id: session.id,
                user_id: linkedUser.id,
              },
            },
            create: {
              live_interview_id: session.id,
              user_id: linkedUser.id,
              role: ParticipantRole.CANDIDATE,
            },
            update: {
              role: ParticipantRole.CANDIDATE,
              left_at: null,
            },
          });
        }
      }

      await tx.interview.update({
        where: { id: session.interview_id },
        data: {
          title: dto.title,
          scheduled_at: window?.startsAt,
          ends_at: window?.endsAt,
          duration_minutes: window?.durationMinutes ?? dto.durationMinutes,
          interviewer_id: dto.interviewerId,
          notes: dto.notes,
          status: InterviewStatus.SCHEDULED,
        },
      });

      return tx.liveInterview.update({
        where: { id: session.id },
        data: {
          recording_enabled: dto.recordingEnabled,
        },
        include: liveInterviewDetailInclude,
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
        liveToken: updated.invite_token,
      });
    }

    return this.context.mapSession(updated);
  }

  async remove(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanManage(session, user);

    if (
      session.interview.status !== InterviewStatus.SCHEDULED &&
      session.interview.status !== InterviewStatus.WAITING
    ) {
      throw new BadRequestException(
        'Only scheduled interviews can be deleted.',
      );
    }

    await this.prisma.interview.delete({
      where: { id: session.interview_id },
    });

    return { deleted: true, id };
  }

  async regenerateInvite(id: string, user: AuthUser) {
    const session = await this.context.findAccessibleSession(id, user);
    this.context.assertCanManage(session, user);

    if (
      session.interview.status === InterviewStatus.COMPLETED ||
      session.interview.status === InterviewStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot regenerate a link for a closed interview.',
      );
    }

    const inviteToken = generateInviteToken();
    const updated = await this.prisma.liveInterview.update({
      where: { id: session.id },
      data: { invite_token: inviteToken },
      include: liveInterviewDetailInclude,
    });

    await this.prisma.liveInterviewEvent.create({
      data: {
        live_interview_id: session.id,
        actor_user_id: user.userId,
        event_type: 'invite_regenerated',
        message: 'Candidate invite link regenerated',
      },
    });

    return this.context.mapSession(updated);
  }

  async listInterviewers(user: AuthUser) {
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

  private async resolveCandidate(
    dto: CreateLiveInterviewDto,
    companyId: string,
  ) {
    if (dto.candidateId) {
      const existing = await this.prisma.candidate.findFirst({
        where: { id: dto.candidateId, company_id: companyId },
      });
      if (!existing) {
        throw new NotFoundException('Candidate not found.');
      }
      return existing;
    }

    if (!dto.candidateEmail || !dto.candidateFirstName || !dto.candidateLastName) {
      throw new BadRequestException(
        'Provide candidateId or candidate name and email.',
      );
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

  private resolveWindow(input: {
    scheduledAt: string;
    endsAt: string;
    durationMinutes?: number;
  }) {
    return resolveInterviewWindow(input.scheduledAt, input.endsAt, {
      invalidDatesMessage: 'Invalid interview window dates.',
      invalidRangeMessage: 'End date/time must be after the start date/time.',
      durationMinutes: input.durationMinutes,
      minDurationMinutes: 15,
      maxDurationMinutes: 240,
    });
  }
}
