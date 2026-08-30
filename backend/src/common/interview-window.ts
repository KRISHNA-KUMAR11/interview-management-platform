import { BadRequestException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';

export interface InterviewWindow {
  startsAt: Date;
  endsAt: Date;
  spanMinutes: number;
  durationMinutes: number;
}

export interface ResolveInterviewWindowOptions {
  invalidDatesMessage: string;
  invalidRangeMessage: string;
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
}

export interface InterviewWindowMessages {
  closed?: string;
  opensAt: (opensAt: Date) => string;
  closedAt: (closedAt: Date) => string;
}

export interface InterviewWindowLike {
  status: InterviewStatus;
  scheduled_at: Date;
  ends_at: Date;
}

export function resolveInterviewWindow(
  scheduledAt: string,
  endsAt: string,
  options: ResolveInterviewWindowOptions,
): InterviewWindow {
  const startsAt = new Date(scheduledAt);
  const closesAt = new Date(endsAt);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(closesAt.getTime())) {
    throw new BadRequestException(options.invalidDatesMessage);
  }

  if (closesAt.getTime() <= startsAt.getTime()) {
    throw new BadRequestException(options.invalidRangeMessage);
  }

  const spanMinutes = Math.round(
    (closesAt.getTime() - startsAt.getTime()) / 60000,
  );
  const requested = options.durationMinutes ?? spanMinutes;
  const durationMinutes = Math.min(
    options.maxDurationMinutes ?? requested,
    Math.max(options.minDurationMinutes ?? requested, requested),
  );

  return { startsAt, endsAt: closesAt, spanMinutes, durationMinutes };
}

export function formatWindowTime(value: Date) {
  return value.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function assertInterviewWindowOpen(
  interview: InterviewWindowLike,
  messages: InterviewWindowMessages,
) {
  if (
    messages.closed &&
    (interview.status === InterviewStatus.COMPLETED ||
      interview.status === InterviewStatus.CANCELLED)
  ) {
    throw new BadRequestException(messages.closed);
  }

  const now = Date.now();
  if (now < interview.scheduled_at.getTime()) {
    throw new BadRequestException(messages.opensAt(interview.scheduled_at));
  }

  if (now > interview.ends_at.getTime()) {
    throw new BadRequestException(messages.closedAt(interview.ends_at));
  }
}

export function isInterviewWindowExpired(interview: {
  status: InterviewStatus;
  ends_at: Date;
}) {
  if (
    interview.status === InterviewStatus.COMPLETED ||
    interview.status === InterviewStatus.CANCELLED
  ) {
    return false;
  }

  return Date.now() > interview.ends_at.getTime();
}
