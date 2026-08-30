import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { TechnicalAttemptStatus } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  technicalInterviewDetailInclude,
  TechnicalInterviewContextService,
} from './technical-interview-context.service';
import { GradeAnswerDto } from './dto/technical-interview.dto';

@Injectable()
export class TechnicalInterviewReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TechnicalInterviewContextService,
  ) {}

  async grade(id: string, dto: GradeAnswerDto, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    if (
      !user.permissions.includes('TechnicalInterview.Review') &&
      session.interview.interviewer_id !== user.userId
    ) {
      throw new ForbiddenException('Review permission required.');
    }
    if (
      session.attempt_status !== TechnicalAttemptStatus.SUBMITTED &&
      session.attempt_status !== TechnicalAttemptStatus.REVIEWED
    ) {
      throw new BadRequestException('Assessment is not ready for grading.');
    }

    const link = session.questions.find((q) => q.question_id === dto.questionId);
    if (!link) {
      throw new BadRequestException('Question is not part of this assessment.');
    }
    if (dto.score > link.points) {
      throw new BadRequestException(
        `Score cannot exceed ${link.points} points for this question.`,
      );
    }

    await this.prisma.technicalAnswer.upsert({
      where: {
        technical_interview_id_question_id: {
          technical_interview_id: id,
          question_id: dto.questionId,
        },
      },
      create: {
        technical_interview_id: id,
        question_id: dto.questionId,
        score: dto.score,
        feedback: dto.feedback,
        graded_by_id: user.userId,
        graded_at: new Date(),
      },
      update: {
        score: dto.score,
        feedback: dto.feedback,
        graded_by_id: user.userId,
        graded_at: new Date(),
      },
    });

    const answers = await this.prisma.technicalAnswer.findMany({
      where: { technical_interview_id: id },
    });
    const total = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);

    const updated = await this.prisma.technicalInterview.update({
      where: { id },
      data: {
        total_score: total,
        attempt_status: TechnicalAttemptStatus.REVIEWED,
      },
      include: technicalInterviewDetailInclude,
    });

    return this.context.mapSession(updated, true);
  }
}
