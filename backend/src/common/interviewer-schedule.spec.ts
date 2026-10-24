import { assertInterviewerFree } from './interviewer-schedule';

describe('assertInterviewerFree', () => {
  const startsAt = new Date('2026-10-24T10:00:00.000Z');
  const endsAt = new Date('2026-10-24T11:00:00.000Z');

  it('allows the window when the interviewer is free', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await expect(
      assertInterviewerFree(
        { interview: { findFirst } } as never,
        {
          interviewerId: 'ian',
          startsAt,
          endsAt,
          exceptInterviewId: 'current',
        },
      ),
    ).resolves.toBeUndefined();

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interviewer_id: 'ian',
          id: { not: 'current' },
          scheduled_at: { lt: endsAt },
          ends_at: { gt: startsAt },
        }),
      }),
    );
  });

  it('rejects a second interview in the same window', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      title: 'Morning screen',
      scheduled_at: startsAt,
    });

    await expect(
      assertInterviewerFree(
        { interview: { findFirst } } as never,
        { interviewerId: 'ian', startsAt, endsAt },
      ),
    ).rejects.toThrow('Morning screen');
  });
});
