import { interviewNotice } from './interview-notice';

describe('interviewNotice', () => {
  const startsAt = new Date('2026-10-24T10:00:00.000Z');
  const endsAt = new Date('2026-10-24T11:00:00.000Z');

  it('includes the invite links when an interview is scheduled', () => {
    const notice = interviewNotice({
      kind: 'scheduled',
      candidateName: 'Casey Candidate',
      title: 'Backend screen',
      startsAt,
      endsAt,
      links: ['Live interview: http://localhost:5173/join/abc'],
    });

    expect(notice.subject).toBe('Interview scheduled: Backend screen');
    expect(notice.text).toContain('http://localhost:5173/join/abc');
  });

  it('tells the candidate a cancelled link no longer works', () => {
    const notice = interviewNotice({
      kind: 'cancelled',
      candidateName: 'Casey Candidate',
      title: 'Backend screen',
      startsAt,
      endsAt,
      links: [],
    });

    expect(notice.subject).toContain('cancelled');
    expect(notice.text).toContain('no longer valid');
  });
});
