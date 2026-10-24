import { BadRequestException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BUSY_STATUSES: InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.WAITING,
  InterviewStatus.IN_PROGRESS,
];

export async function assertInterviewerFree(
  prisma: PrismaService,
  input: {
    interviewerId: string;
    startsAt: Date;
    endsAt: Date;
    exceptInterviewId?: string;
  },
) {
  const clash = await prisma.interview.findFirst({
    where: {
      interviewer_id: input.interviewerId,
      status: { in: BUSY_STATUSES },
      scheduled_at: { lt: input.endsAt },
      ends_at: { gt: input.startsAt },
      ...(input.exceptInterviewId
        ? { id: { not: input.exceptInterviewId } }
        : {}),
    },
    select: { title: true, scheduled_at: true },
  });

  if (!clash) return;

  throw new BadRequestException(
    `This interviewer already has "${clash.title}" scheduled in that window (${clash.scheduled_at.toLocaleString()}).`,
  );
}
