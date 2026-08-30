import { Injectable } from '@nestjs/common';
import {
  InterviewStatus,
  Prisma,
  TechnicalAttemptStatus,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  assertPermission,
  interviewScopeWhere,
} from '../common/interview-scope';
import { PrismaService } from '../prisma/prisma.service';

const OPEN_STATUSES: InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.WAITING,
  InterviewStatus.IN_PROGRESS,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthUser) {
    assertPermission(user, 'Dashboard.View');
    const scope = interviewScopeWhere(user);
    const companyFilter =
      user.role === 'SUPER_ADMIN' && !user.companyId
        ? {}
        : { company_id: user.companyId ?? undefined };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      totalInterviews,
      upcomingCount,
      todayCount,
      completedThisWeek,
      candidateCount,
      questionCount,
      pendingReviews,
      upcoming,
      recent,
      events,
    ] = await Promise.all([
      this.prisma.interview.count({ where: scope }),
      this.prisma.interview.count({
        where: { ...scope, status: { in: OPEN_STATUSES } },
      }),
      this.prisma.interview.count({
        where: {
          ...scope,
          status: { in: OPEN_STATUSES },
          scheduled_at: { gte: startOfToday, lt: startOfTomorrow },
        },
      }),
      this.prisma.interview.count({
        where: {
          ...scope,
          status: InterviewStatus.COMPLETED,
          updated_at: { gte: weekAgo },
        },
      }),
      user.permissions.includes('Candidate.View')
        ? this.prisma.candidate.count({ where: companyFilter })
        : Promise.resolve(0),
      user.permissions.includes('QuestionBank.View')
        ? this.prisma.question.count({ where: companyFilter })
        : Promise.resolve(0),
      this.prisma.technicalInterview.count({
        where: {
          attempt_status: TechnicalAttemptStatus.SUBMITTED,
          interview: scope,
        },
      }),
      this.prisma.interview.findMany({
        where: { ...scope, status: { in: OPEN_STATUSES } },
        include: this.listInclude(),
        orderBy: { scheduled_at: 'asc' },
        take: 6,
      }),
      this.prisma.interview.findMany({
        where: { ...scope, status: InterviewStatus.COMPLETED },
        include: this.listInclude(),
        orderBy: { updated_at: 'desc' },
        take: 5,
      }),
      this.prisma.liveInterviewEvent.findMany({
        where: { liveInterview: { interview: scope } },
        include: {
          actor: { select: { first_name: true, last_name: true } },
          liveInterview: {
            select: { id: true, interview: { select: { title: true } } },
          },
        },
        orderBy: { created_at: 'desc' },
        take: 8,
      }),
    ]);

    return {
      stats: {
        totalInterviews,
        upcoming: upcomingCount,
        today: todayCount,
        completedThisWeek,
        candidates: candidateCount,
        questions: questionCount,
        pendingReviews,
      },
      upcoming: upcoming.map((interview) => this.mapRow(interview)),
      recent: recent.map((interview) => this.mapRow(interview)),
      activity: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        message: event.message,
        interviewTitle: event.liveInterview.interview.title,
        liveInterviewId: event.liveInterview.id,
        actorName: event.actor
          ? `${event.actor.first_name} ${event.actor.last_name}`
          : 'Candidate',
        createdAt: event.created_at,
      })),
    };
  }

  private listInclude() {
    return {
      candidate: { select: { first_name: true, last_name: true, email: true } },
      interviewer: { select: { first_name: true, last_name: true } },
      liveSession: { select: { id: true } },
      technicalSession: { select: { id: true, attempt_status: true } },
      feedback: { select: { rating: true, recommendation: true } },
    };
  }

  private mapRow(
    interview: Prisma.InterviewGetPayload<{
      include: {
        candidate: {
          select: { first_name: true; last_name: true; email: true };
        };
        interviewer: { select: { first_name: true; last_name: true } };
        liveSession: { select: { id: true } };
        technicalSession: { select: { id: true; attempt_status: true } };
        feedback: { select: { rating: true; recommendation: true } };
      };
    }>,
  ) {
    const now = Date.now();
    return {
      id: interview.id,
      title: interview.title,
      type: interview.type,
      status: interview.status,
      scheduledAt: interview.scheduled_at,
      endsAt: interview.ends_at,
      windowOpen:
        OPEN_STATUSES.includes(interview.status) &&
        interview.scheduled_at.getTime() <= now &&
        interview.ends_at.getTime() > now,
      candidateName: `${interview.candidate.first_name} ${interview.candidate.last_name}`,
      candidateEmail: interview.candidate.email,
      interviewerName: `${interview.interviewer.first_name} ${interview.interviewer.last_name}`,
      liveInterviewId: interview.liveSession?.id ?? null,
      technicalInterviewId: interview.technicalSession?.id ?? null,
      technicalAttemptStatus: interview.technicalSession?.attempt_status ?? null,
      rating: interview.feedback.length
        ? Number(
            (
              interview.feedback.reduce((sum, f) => sum + f.rating, 0) /
              interview.feedback.length
            ).toFixed(1),
          )
        : null,
    };
  }
}
