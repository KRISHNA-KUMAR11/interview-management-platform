import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { LiveInterviewContextService } from './live-interview-context.service';
import { SubmitFeedbackDto } from './dto/live-interview.dto';

@Injectable()
export class LiveInterviewFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: LiveInterviewContextService,
  ) {}

  async submitFeedback(id: string, user: AuthUser, dto: SubmitFeedbackDto) {
    const session = await this.context.findAccessibleSession(id, user);
    const isInterviewer =
      session.interview.interviewer_id === user.userId ||
      user.permissions.includes('Interview.Feedback');

    if (!isInterviewer && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only interviewers can submit feedback.');
    }

    const feedback = await this.prisma.interviewFeedback.upsert({
      where: {
        interview_id_submitted_by_id: {
          interview_id: session.interview_id,
          submitted_by_id: user.userId,
        },
      },
      create: {
        interview_id: session.interview_id,
        submitted_by_id: user.userId,
        rating: dto.rating,
        recommendation: dto.recommendation,
        strengths: dto.strengths,
        weaknesses: dto.weaknesses,
        comments: dto.comments,
      },
      update: {
        rating: dto.rating,
        recommendation: dto.recommendation,
        strengths: dto.strengths,
        weaknesses: dto.weaknesses,
        comments: dto.comments,
        submitted_at: new Date(),
      },
    });

    return {
      id: feedback.id,
      interviewId: feedback.interview_id,
      submittedById: feedback.submitted_by_id,
      rating: feedback.rating,
      recommendation: feedback.recommendation,
      strengths: feedback.strengths,
      weaknesses: feedback.weaknesses,
      comments: feedback.comments,
      submittedAt: feedback.submitted_at,
    };
  }
}
