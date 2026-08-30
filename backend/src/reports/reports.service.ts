import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HireRecommendation,
  InterviewStatus,
  InterviewType,
  Prisma,
  TechnicalAttemptStatus,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  assertPermission,
  interviewScopeWhere,
} from '../common/interview-scope';
import { PrismaService } from '../prisma/prisma.service';

const MONTH_KEYS = 6;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: AuthUser, from?: string, to?: string) {
    assertPermission(user, 'Report.View');
    const range = this.resolveRange(from, to);
    const where = this.scopedWhere(user, range);

    const [interviews, grouped, byType, feedback, technical] =
      await Promise.all([
        this.prisma.interview.findMany({
          where,
          select: {
            id: true,
            status: true,
            type: true,
            scheduled_at: true,
            duration_minutes: true,
            interviewer_id: true,
            interviewer: { select: { first_name: true, last_name: true } },
          },
        }),
        this.prisma.interview.groupBy({
          by: ['status'],
          where,
          _count: { _all: true },
        }),
        this.prisma.interview.groupBy({
          by: ['type'],
          where,
          _count: { _all: true },
        }),
        this.prisma.interviewFeedback.findMany({
          where: { interview: where },
          select: { rating: true, recommendation: true, interview_id: true },
        }),
        this.prisma.technicalInterview.findMany({
          where: { interview: where },
          select: {
            attempt_status: true,
            total_score: true,
            max_score: true,
          },
        }),
      ]);

    const completed = this.countFor(grouped, InterviewStatus.COMPLETED);
    const cancelled = this.countFor(grouped, InterviewStatus.CANCELLED);
    const total = interviews.length;

    const gradedTechnical = technical.filter(
      (item) => item.total_score != null && item.max_score > 0,
    );
    const avgScorePct = gradedTechnical.length
      ? Math.round(
          (gradedTechnical.reduce(
            (sum, item) =>
              sum + (item.total_score ?? 0) / item.max_score,
            0,
          ) /
            gradedTechnical.length) *
            100,
        )
      : null;

    return {
      range: { from: range.from, to: range.to },
      totals: {
        interviews: total,
        completed,
        cancelled,
        completionRate: total ? Math.round((completed / total) * 100) : 0,
        avgRating: feedback.length
          ? Number(
              (
                feedback.reduce((sum, item) => sum + item.rating, 0) /
                feedback.length
              ).toFixed(1),
            )
          : null,
        feedbackCount: feedback.length,
        avgDurationMinutes: total
          ? Math.round(
              interviews.reduce(
                (sum, item) => sum + item.duration_minutes,
                0,
              ) / total,
            )
          : 0,
      },
      byStatus: Object.values(InterviewStatus).map((status) => ({
        status,
        count: this.countFor(grouped, status),
      })),
      byType: Object.values(InterviewType).map((type) => ({
        type,
        count: byType.find((row) => row.type === type)?._count._all ?? 0,
      })),
      byMonth: this.buildMonthlySeries(interviews, range),
      recommendations: Object.values(HireRecommendation).map(
        (recommendation) => ({
          recommendation,
          count: feedback.filter(
            (item) => item.recommendation === recommendation,
          ).length,
        }),
      ),
      interviewers: this.buildInterviewerBreakdown(interviews, feedback),
      technical: {
        total: technical.length,
        submitted: technical.filter(
          (item) =>
            item.attempt_status === TechnicalAttemptStatus.SUBMITTED ||
            item.attempt_status === TechnicalAttemptStatus.REVIEWED,
        ).length,
        expired: technical.filter(
          (item) => item.attempt_status === TechnicalAttemptStatus.EXPIRED,
        ).length,
        notStarted: technical.filter(
          (item) =>
            item.attempt_status === TechnicalAttemptStatus.NOT_STARTED,
        ).length,
        avgScorePct,
      },
    };
  }

  async exportCsv(user: AuthUser, from?: string, to?: string) {
    assertPermission(user, 'Report.Export');
    const range = this.resolveRange(from, to);
    const where = this.scopedWhere(user, range);

    const interviews = await this.prisma.interview.findMany({
      where,
      include: {
        candidate: {
          select: { first_name: true, last_name: true, email: true },
        },
        interviewer: { select: { first_name: true, last_name: true } },
        feedback: { select: { rating: true, recommendation: true } },
        technicalSession: { select: { total_score: true, max_score: true } },
      },
      orderBy: { scheduled_at: 'desc' },
    });

    const header = [
      'Title',
      'Type',
      'Status',
      'Scheduled',
      'Ends',
      'Duration (min)',
      'Candidate',
      'Candidate email',
      'Interviewer',
      'Avg rating',
      'Recommendation',
      'Technical score',
    ];

    const rows = interviews.map((interview) => {
      const avgRating = interview.feedback.length
        ? (
            interview.feedback.reduce((sum, f) => sum + f.rating, 0) /
            interview.feedback.length
          ).toFixed(1)
        : '';
      const technicalScore =
        interview.technicalSession?.total_score != null
          ? `${interview.technicalSession.total_score}/${interview.technicalSession.max_score}`
          : '';

      return [
        interview.title,
        interview.type,
        interview.status,
        interview.scheduled_at.toISOString(),
        interview.ends_at.toISOString(),
        String(interview.duration_minutes),
        `${interview.candidate.first_name} ${interview.candidate.last_name}`,
        interview.candidate.email,
        `${interview.interviewer.first_name} ${interview.interviewer.last_name}`,
        avgRating,
        interview.feedback[0]?.recommendation ?? '',
        technicalScore,
      ];
    });

    return [header, ...rows]
      .map((row) => row.map((cell) => this.csvCell(cell)).join(','))
      .join('\r\n');
  }

  private csvCell(value: string) {
    if (/[",\r\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private countFor(
    grouped: Array<{ status: InterviewStatus; _count: { _all: number } }>,
    status: InterviewStatus,
  ) {
    return grouped.find((row) => row.status === status)?._count._all ?? 0;
  }

  private buildMonthlySeries(
    interviews: Array<{ scheduled_at: Date; status: InterviewStatus }>,
    range: { from: Date; to: Date },
  ) {
    const buckets = new Map<
      string,
      { month: string; label: string; total: number; completed: number }
    >();

    const cursor = new Date(range.to);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);

    for (let index = 0; index < MONTH_KEYS; index += 1) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      buckets.set(key, {
        month: key,
        label: cursor.toLocaleString(undefined, {
          month: 'short',
          year: '2-digit',
        }),
        total: 0,
        completed: 0,
      });
      cursor.setMonth(cursor.getMonth() - 1);
    }

    for (const interview of interviews) {
      const key = `${interview.scheduled_at.getFullYear()}-${String(
        interview.scheduled_at.getMonth() + 1,
      ).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      if (interview.status === InterviewStatus.COMPLETED) {
        bucket.completed += 1;
      }
    }

    return [...buckets.values()].reverse();
  }

  private buildInterviewerBreakdown(
    interviews: Array<{
      id: string;
      status: InterviewStatus;
      interviewer_id: string;
      interviewer: { first_name: string; last_name: string };
    }>,
    feedback: Array<{ rating: number; interview_id: string }>,
  ) {
    const ratingsByInterview = new Map<string, number[]>();
    for (const item of feedback) {
      const list = ratingsByInterview.get(item.interview_id) ?? [];
      list.push(item.rating);
      ratingsByInterview.set(item.interview_id, list);
    }

    const map = new Map<
      string,
      {
        id: string;
        name: string;
        total: number;
        completed: number;
        ratings: number[];
      }
    >();

    for (const interview of interviews) {
      const entry = map.get(interview.interviewer_id) ?? {
        id: interview.interviewer_id,
        name: `${interview.interviewer.first_name} ${interview.interviewer.last_name}`,
        total: 0,
        completed: 0,
        ratings: [],
      };
      entry.total += 1;
      if (interview.status === InterviewStatus.COMPLETED) entry.completed += 1;
      entry.ratings.push(...(ratingsByInterview.get(interview.id) ?? []));
      map.set(interview.interviewer_id, entry);
    }

    return [...map.values()]
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        total: entry.total,
        completed: entry.completed,
        avgRating: entry.ratings.length
          ? Number(
              (
                entry.ratings.reduce((sum, value) => sum + value, 0) /
                entry.ratings.length
              ).toFixed(1),
            )
          : null,
      }))
      .sort((a, b) => b.total - a.total);
  }

  private scopedWhere(
    user: AuthUser,
    range: { from: Date; to: Date },
  ): Prisma.InterviewWhereInput {
    return {
      ...interviewScopeWhere(user),
      scheduled_at: { gte: range.from, lte: range.to },
    };
  }

  private resolveRange(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(new Date(end).setMonth(end.getMonth() - 6));

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid report date range.');
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('Start date must be before end date.');
    }

    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: end };
  }
}
