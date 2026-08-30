import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionDifficulty, QuestionType } from '@prisma/client';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  buildPaginatedResult,
  isPaginationRequested,
  PaginationQueryDto,
  resolvePagination,
} from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: PaginationQueryDto = {}) {
    this.assertStaff(user);
    const companyId = this.requireCompany(user);
    const where =
      user.role === 'SUPER_ADMIN' && !user.companyId
        ? {}
        : { company_id: companyId };
    const include = {
      createdBy: {
        select: { id: true, first_name: true, last_name: true, email: true },
      },
    };

    if (!isPaginationRequested(query)) {
      const questions = await this.prisma.question.findMany({
        where,
        include,
        orderBy: { updated_at: 'desc' },
      });
      return questions.map((q) => this.mapQuestion(q, true));
    }

    const pagination = resolvePagination(query);
    const [total, questions] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include,
        orderBy: { updated_at: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    return buildPaginatedResult(
      questions.map((q) => this.mapQuestion(q, true)),
      total,
      pagination,
    );
  }

  async getById(id: string, user: AuthUser) {
    this.assertStaff(user);
    const question = await this.findAccessible(id, user);
    return this.mapQuestion(question, true);
  }

  async create(dto: CreateQuestionDto, user: AuthUser) {
    this.assertCanWrite(user);
    const companyId = this.requireCompany(user);
    this.validateOptions(dto.type, dto.options);

    const created = await this.prisma.question.create({
      data: {
        company_id: companyId,
        title: dto.title,
        body: dto.body,
        type: dto.type,
        difficulty: dto.difficulty ?? QuestionDifficulty.MEDIUM,
        language: dto.language,
        points: dto.points ?? 10,
        options_json: dto.options ? JSON.stringify(dto.options) : null,
        starter_code: dto.starterCode,
        created_by_id: user.userId,
      },
      include: {
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });

    return this.mapQuestion(created, true);
  }

  async update(id: string, dto: UpdateQuestionDto, user: AuthUser) {
    this.assertCanWrite(user);
    const existing = await this.findAccessible(id, user);
    const nextType = dto.type ?? existing.type;
    if (dto.options || dto.type) {
      this.validateOptions(nextType, dto.options);
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        type: dto.type,
        difficulty: dto.difficulty,
        language: dto.language,
        points: dto.points,
        options_json:
          dto.options !== undefined ? JSON.stringify(dto.options) : undefined,
        starter_code: dto.starterCode,
      },
      include: {
        createdBy: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });

    return this.mapQuestion(updated, true);
  }

  async remove(id: string, user: AuthUser) {
    this.assertCanDelete(user);
    await this.findAccessible(id, user);
    const inUse = await this.prisma.technicalInterviewQuestion.count({
      where: { question_id: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        'Question is used in technical interviews and cannot be deleted.',
      );
    }
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true, id };
  }

  private findAccessible(id: string, user: AuthUser) {
    return this.prisma.question
      .findUnique({
        where: { id },
        include: {
          createdBy: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      })
      .then((question) => {
        if (!question) throw new NotFoundException('Question not found.');
        if (
          user.role !== 'SUPER_ADMIN' &&
          user.companyId &&
          question.company_id !== user.companyId
        ) {
          throw new ForbiddenException('Access denied for this question.');
        }
        return question;
      });
  }

  private validateOptions(
    type: QuestionType,
    options?: Array<{ id: string; text: string; isCorrect?: boolean }>,
  ) {
    if (type !== QuestionType.MCQ) return;
    if (!options || options.length < 2) {
      throw new BadRequestException('MCQ questions need at least 2 options.');
    }
    if (!options.some((o) => o.isCorrect)) {
      throw new BadRequestException('Mark at least one correct MCQ option.');
    }
  }

  private mapQuestion(
    question: {
      id: string;
      company_id: string;
      title: string;
      body: string;
      type: QuestionType;
      difficulty: QuestionDifficulty;
      language: string | null;
      points: number;
      options_json: string | null;
      starter_code: string | null;
      created_by_id: string;
      created_at: Date;
      updated_at: Date;
      createdBy?: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
      };
    },
    includeAnswerKey: boolean,
  ) {
    const options = question.options_json
      ? (JSON.parse(question.options_json) as Array<{
          id: string;
          text: string;
          isCorrect?: boolean;
        }>)
      : [];

    return {
      id: question.id,
      companyId: question.company_id,
      title: question.title,
      body: question.body,
      type: question.type,
      difficulty: question.difficulty,
      language: question.language,
      points: question.points,
      starterCode: question.starter_code,
      options: includeAnswerKey
        ? options
        : options.map(({ id, text }) => ({ id, text })),
      createdBy: question.createdBy
        ? {
            id: question.createdBy.id,
            firstName: question.createdBy.first_name,
            lastName: question.createdBy.last_name,
            email: question.createdBy.email,
          }
        : question.createdBy,
      createdAt: question.created_at,
      updatedAt: question.updated_at,
    };
  }

  private requireCompany(user: AuthUser) {
    if (!user.companyId && user.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Company context is required.');
    }
    if (!user.companyId) {
      throw new BadRequestException('Select a company context.');
    }
    return user.companyId;
  }

  private assertStaff(user: AuthUser) {
    if (user.isGuest) {
      throw new ForbiddenException('Guests cannot access the question bank.');
    }
    if (!user.permissions.includes('QuestionBank.View')) {
      throw new ForbiddenException('Question bank view permission required.');
    }
  }

  private assertCanWrite(user: AuthUser) {
    this.assertStaff(user);
    if (
      !user.permissions.includes('QuestionBank.Create') &&
      !user.permissions.includes('QuestionBank.Edit')
    ) {
      throw new ForbiddenException('Question bank write permission required.');
    }
  }

  private assertCanDelete(user: AuthUser) {
    this.assertStaff(user);
    if (!user.permissions.includes('QuestionBank.Delete')) {
      throw new ForbiddenException('Question bank delete permission required.');
    }
  }
}
