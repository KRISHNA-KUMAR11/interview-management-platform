import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InterviewStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCandidateDto,
  ListCandidatesQueryDto,
  UpdateCandidateDto,
} from './dto/candidate.dto';

type CandidateWithInterviews = Prisma.CandidateGetPayload<{
  include: {
    interviews: {
      include: {
        interviewer: { select: { first_name: true; last_name: true } };
        liveSession: { select: { id: true } };
        technicalSession: { select: { id: true; attempt_status: true } };
      };
    };
  };
}>;

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ListCandidatesQueryDto = {}) {
    this.assertCanView(user);

    const where: Prisma.CandidateWhereInput = {
      ...this.companyScope(user),
    };

    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { first_name: { contains: term } },
        { last_name: { contains: term } },
        { email: { contains: term } },
      ];
    }

    if (!isPaginationRequested(query)) {
      const candidates = await this.prisma.candidate.findMany({
        where,
        include: this.detailInclude(),
        orderBy: { created_at: 'desc' },
      });

      return candidates.map((candidate) => this.mapCandidate(candidate));
    }

    const pagination = resolvePagination(query);
    const [total, candidates] = await Promise.all([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        include: this.detailInclude(),
        orderBy: { created_at: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return buildPaginatedResult(
      candidates.map((candidate) => this.mapCandidate(candidate)),
      total,
      pagination,
    );
  }

  async getById(id: string, user: AuthUser) {
    this.assertCanView(user);
    const candidate = await this.findAccessible(id, user);
    return this.mapCandidate(candidate);
  }

  async create(dto: CreateCandidateDto, user: AuthUser) {
    this.assertPermission(user, 'Candidate.Create');
    const companyId = this.requireCompany(user);
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.candidate.findUnique({
      where: { company_id_email: { company_id: companyId, email } },
    });
    if (existing) {
      throw new ConflictException(
        'A candidate with this email already exists.',
      );
    }

    const created = await this.prisma.candidate.create({
      data: {
        company_id: companyId,
        first_name: dto.firstName.trim(),
        last_name: dto.lastName.trim(),
        email,
        phone: dto.phone?.trim() || null,
      },
      include: this.detailInclude(),
    });

    return this.mapCandidate(created);
  }

  async update(id: string, dto: UpdateCandidateDto, user: AuthUser) {
    this.assertPermission(user, 'Candidate.Edit');
    const existing = await this.findAccessible(id, user);
    const email = dto.email?.trim().toLowerCase();

    if (email && email !== existing.email) {
      const clash = await this.prisma.candidate.findUnique({
        where: {
          company_id_email: { company_id: existing.company_id, email },
        },
      });
      if (clash) {
        throw new ConflictException(
          'Another candidate already uses this email.',
        );
      }
    }

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: {
        first_name: dto.firstName?.trim(),
        last_name: dto.lastName?.trim(),
        email,
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
      },
      include: this.detailInclude(),
    });

    return this.mapCandidate(updated);
  }

  async remove(id: string, user: AuthUser) {
    this.assertPermission(user, 'Candidate.Delete');
    const candidate = await this.findAccessible(id, user);

    if (candidate.interviews.length > 0) {
      throw new BadRequestException(
        `This candidate has ${candidate.interviews.length} interview(s). Delete those first.`,
      );
    }

    await this.prisma.candidate.delete({ where: { id } });
    return { deleted: true, id };
  }

  private detailInclude() {
    return {
      interviews: {
        include: {
          interviewer: { select: { first_name: true, last_name: true } },
          liveSession: { select: { id: true } },
          technicalSession: { select: { id: true, attempt_status: true } },
        },
        orderBy: { scheduled_at: 'desc' as const },
      },
    };
  }

  private mapCandidate(candidate: CandidateWithInterviews) {
    const interviews = candidate.interviews;
    const upcoming = interviews
      .filter(
        (interview) =>
          interview.status === InterviewStatus.SCHEDULED ||
          interview.status === InterviewStatus.WAITING ||
          interview.status === InterviewStatus.IN_PROGRESS,
      )
      .sort(
        (a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime(),
      )[0];

    return {
      id: candidate.id,
      companyId: candidate.company_id,
      firstName: candidate.first_name,
      lastName: candidate.last_name,
      email: candidate.email,
      phone: candidate.phone,
      hasLogin: Boolean(candidate.user_id),
      createdAt: candidate.created_at,
      updatedAt: candidate.updated_at,
      stats: {
        total: interviews.length,
        completed: interviews.filter(
          (interview) => interview.status === InterviewStatus.COMPLETED,
        ).length,
        upcoming: interviews.filter(
          (interview) =>
            interview.status === InterviewStatus.SCHEDULED ||
            interview.status === InterviewStatus.WAITING ||
            interview.status === InterviewStatus.IN_PROGRESS,
        ).length,
      },
      nextInterviewAt: upcoming?.scheduled_at ?? null,
      interviews: interviews.map((interview) => ({
        id: interview.id,
        title: interview.title,
        type: interview.type,
        status: interview.status,
        scheduledAt: interview.scheduled_at,
        endsAt: interview.ends_at,
        interviewerName: `${interview.interviewer.first_name} ${interview.interviewer.last_name}`,
        liveInterviewId: interview.liveSession?.id ?? null,
        technicalInterviewId: interview.technicalSession?.id ?? null,
        technicalAttemptStatus:
          interview.technicalSession?.attempt_status ?? null,
      })),
    };
  }

  private async findAccessible(id: string, user: AuthUser) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: this.detailInclude(),
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.companyId &&
      candidate.company_id !== user.companyId
    ) {
      throw new ForbiddenException('Access denied for this candidate.');
    }

    return candidate;
  }

  private companyScope(user: AuthUser): Prisma.CandidateWhereInput {
    if (user.role === 'SUPER_ADMIN' && !user.companyId) return {};
    return { company_id: user.companyId ?? undefined };
  }

  private requireCompany(user: AuthUser) {
    if (!user.companyId) {
      throw new BadRequestException('Company context is required.');
    }
    return user.companyId;
  }

  private assertCanView(user: AuthUser) {
    this.assertPermission(user, 'Candidate.View');
  }

  private assertPermission(user: AuthUser, permission: string) {
    if (user.isGuest) {
      throw new ForbiddenException('Guests cannot access candidate records.');
    }
    if (!user.permissions.includes(permission)) {
      throw new ForbiddenException(`${permission} permission required.`);
    }
  }
}
