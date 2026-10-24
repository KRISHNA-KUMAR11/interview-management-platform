import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  InterviewStatus,
  QuestionType,
  TechnicalAttemptStatus,
} from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TechnicalInterviewContextService } from './technical-interview-context.service';
import {
  SaveAnswerDto,
  SubmitAnswersDto,
} from './dto/technical-interview.dto';

@Injectable()
export class TechnicalInterviewAttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TechnicalInterviewContextService,
  ) {}

  async start(id: string, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCandidateAccess(session, user);
    await this.context.closeIfWindowExpired(session.interview);
    const fresh = await this.context.findAccessible(id, user);
    this.context.assertWindowOpen(fresh.interview);

    if (
      fresh.attempt_status === TechnicalAttemptStatus.SUBMITTED ||
      fresh.attempt_status === TechnicalAttemptStatus.REVIEWED
    ) {
      throw new BadRequestException('Assessment already submitted.');
    }

    if (fresh.attempt_status === TechnicalAttemptStatus.NOT_STARTED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.technicalInterview.update({
          where: { id },
          data: {
            attempt_status: TechnicalAttemptStatus.IN_PROGRESS,
            started_at: new Date(),
          },
        });
        await tx.interview.update({
          where: { id: fresh.interview_id },
          data: { status: InterviewStatus.IN_PROGRESS },
        });
      });
    }

    const started = await this.context.findAccessible(id, user);
    return this.context.mapSession(started, false);
  }

  async saveAnswers(id: string, dto: SubmitAnswersDto, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCandidateAccess(session, user);
    this.context.assertInProgress(session);
    this.context.assertNotTimedOut(session);

    await this.upsertAnswers(session.id, dto.answers);
    const fresh = await this.context.findAccessible(id, user);
    return this.context.mapSession(fresh, false);
  }

  async submit(id: string, dto: SubmitAnswersDto, user: AuthUser) {
    const session = await this.context.findAccessible(id, user);
    this.context.assertCandidateAccess(session, user);
    this.context.assertInProgress(session);
    // The browser auto-submits as the countdown hits zero, which is already
    // past the server deadline. Accept that final submit instead of erroring.

    await this.upsertAnswers(session.id, dto.answers);
    const autoScore = await this.autoGradeMcq(session.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.technicalInterview.update({
        where: { id },
        data: {
          attempt_status: TechnicalAttemptStatus.SUBMITTED,
          submitted_at: new Date(),
          total_score: autoScore.total,
        },
      });
      await tx.interview.update({
        where: { id: session.interview_id },
        data: { status: InterviewStatus.COMPLETED },
      });
    });

    const fresh = await this.context.findAccessible(id, user);
    return this.context.mapSession(fresh, false);
  }

  private async upsertAnswers(
    technicalInterviewId: string,
    answers: SaveAnswerDto[],
  ) {
    for (const answer of answers) {
      await this.prisma.technicalAnswer.upsert({
        where: {
          technical_interview_id_question_id: {
            technical_interview_id: technicalInterviewId,
            question_id: answer.questionId,
          },
        },
        create: {
          technical_interview_id: technicalInterviewId,
          question_id: answer.questionId,
          answer_text: answer.answerText,
          selected_option_id: answer.selectedOptionId,
          code: answer.code,
        },
        update: {
          answer_text: answer.answerText,
          selected_option_id: answer.selectedOptionId,
          code: answer.code,
        },
      });
    }
  }

  private async autoGradeMcq(technicalInterviewId: string) {
    const session = await this.prisma.technicalInterview.findUniqueOrThrow({
      where: { id: technicalInterviewId },
      include: {
        questions: { include: { question: true } },
        answers: true,
      },
    });

    let total = 0;
    for (const link of session.questions) {
      if (link.question.type !== QuestionType.MCQ) continue;
      const options = link.question.options_json
        ? (JSON.parse(link.question.options_json) as Array<{
            id: string;
            isCorrect?: boolean;
          }>)
        : [];
      const correct = options.find((o) => o.isCorrect)?.id;
      const answer = session.answers.find(
        (a) => a.question_id === link.question_id,
      );
      const score =
        correct && answer?.selected_option_id === correct ? link.points : 0;
      total += score;
      await this.prisma.technicalAnswer.upsert({
        where: {
          technical_interview_id_question_id: {
            technical_interview_id: technicalInterviewId,
            question_id: link.question_id,
          },
        },
        create: {
          technical_interview_id: technicalInterviewId,
          question_id: link.question_id,
          selected_option_id: answer?.selected_option_id,
          score,
          graded_at: new Date(),
        },
        update: {
          score,
          graded_at: new Date(),
        },
      });
    }

    const existing = await this.prisma.technicalAnswer.findMany({
      where: { technical_interview_id: technicalInterviewId },
    });
    total = existing.reduce((sum, a) => sum + (a.score ?? 0), 0);
    return { total };
  }

  async logIntegrity(
    id: string,
    user: AuthUser,
    eventType: string,
    message?: string,
  ) {
    const allowed = new Set([
      'tab_hidden',
      'tab_visible',
      'window_blur',
      'copy_blocked',
      'paste_blocked',
      'cut_blocked',
      'print_blocked',
      'context_menu_blocked',
      'fullscreen_exited',
      'camera_interrupted',
    ]);
    if (!allowed.has(eventType)) {
      return { recorded: false };
    }

    const session = await this.context.findAccessible(id, user);
    this.context.assertCandidateAccess(session, user);
    if (
      session.attempt_status !== TechnicalAttemptStatus.IN_PROGRESS &&
      session.attempt_status !== TechnicalAttemptStatus.NOT_STARTED
    ) {
      return { recorded: false };
    }

    await this.importLegacyEvents(id);
    const event = await this.prisma.technicalInterviewEvent.create({
      data: {
        technical_interview_id: id,
        event_type: eventType,
        message: message?.slice(0, 240) ?? null,
      },
    });
    return {
      recorded: true,
      id: event.id,
      eventType: event.event_type,
      createdAt: event.created_at,
    };
  }

  async listIntegrityEvents(id: string) {
    await this.importLegacyEvents(id);
    const rows = await this.prisma.technicalInterviewEvent.findMany({
      where: { technical_interview_id: id },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      message: event.message,
      createdAt: event.created_at,
    }));
  }

  private async importLegacyEvents(id: string) {
    const existing = await this.prisma.technicalInterviewEvent.count({
      where: { technical_interview_id: id },
    });
    if (existing > 0) return;

    const path = join(
      process.cwd(),
      'uploads',
      'technical-interviews',
      id,
      'integrity-events.json',
    );
    if (!existsSync(path)) return;

    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Array<{
        eventType?: string;
        message?: string | null;
        createdAt?: string;
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      await this.prisma.technicalInterviewEvent.createMany({
        data: parsed
          .filter((event) => event.eventType)
          .map((event) => ({
            technical_interview_id: id,
            event_type: event.eventType as string,
            message: event.message ?? null,
            created_at: event.createdAt ? new Date(event.createdAt) : new Date(),
          })),
      });
    } catch {
      return;
    }
  }
}
