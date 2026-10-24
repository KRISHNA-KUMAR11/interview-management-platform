import { BadRequestException } from '@nestjs/common';
import { InterviewStatus } from '@prisma/client';
import { assertInterviewWindowOpen } from './interview-window';

const messages = {
  closed: 'This invite link is no longer valid.',
  opensAt: () => 'not open',
  closedAt: () => 'expired',
};

describe('assertInterviewWindowOpen', () => {
  const now = new Date();

  it('rejects a cancelled interview before the clock is checked', () => {
    expect(() =>
      assertInterviewWindowOpen(
        {
          status: InterviewStatus.CANCELLED,
          scheduled_at: new Date(now.getTime() - 60_000),
          ends_at: new Date(now.getTime() + 60_000),
        },
        messages,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a completed interview with the closed message', () => {
    expect(() =>
      assertInterviewWindowOpen(
        {
          status: InterviewStatus.COMPLETED,
          scheduled_at: new Date(now.getTime() - 60_000),
          ends_at: new Date(now.getTime() + 60_000),
        },
        messages,
      ),
    ).toThrow('This invite link is no longer valid.');
  });

  it('rejects an invite after the window has ended', () => {
    expect(() =>
      assertInterviewWindowOpen(
        {
          status: InterviewStatus.SCHEDULED,
          scheduled_at: new Date(now.getTime() - 120_000),
          ends_at: new Date(now.getTime() - 60_000),
        },
        messages,
      ),
    ).toThrow('expired');
  });
});
