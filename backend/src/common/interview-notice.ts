export interface InterviewNotice {
  kind: 'scheduled' | 'updated' | 'cancelled';
  candidateName: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  links: string[];
}

export function interviewNotice(input: InterviewNotice) {
  const when = `${input.startsAt.toLocaleString()} – ${input.endsAt.toLocaleString()}`;
  const linkBlock =
    input.links.length > 0
      ? input.links.map((link) => `- ${link}`).join('\n')
      : '- No invite link is attached.';

  if (input.kind === 'cancelled') {
    return {
      subject: `Interview cancelled: ${input.title}`,
      text: [
        `Hello ${input.candidateName},`,
        '',
        `"${input.title}" was cancelled. The invite link is no longer valid.`,
        '',
        `Original window: ${when}`,
      ].join('\n'),
    };
  }

  const lead =
    input.kind === 'updated'
      ? `"${input.title}" was updated. Use the link below for the current window.`
      : `You are invited to "${input.title}".`;

  return {
    subject:
      input.kind === 'updated'
        ? `Interview updated: ${input.title}`
        : `Interview scheduled: ${input.title}`,
    text: [
      `Hello ${input.candidateName},`,
      '',
      lead,
      `Window: ${when}`,
      '',
      'Open the interview here:',
      linkBlock,
    ].join('\n'),
  };
}
