import { Injectable, NotFoundException } from '@nestjs/common';
import { GuestAccessService } from '../common/guest-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  technicalInterviewDetailInclude,
  TechnicalInterviewContextService,
} from './technical-interview-context.service';

@Injectable()
export class TechnicalInterviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TechnicalInterviewContextService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async getByInviteToken(token: string) {
    const session = await this.findByInviteToken(token);
    await this.context.closeIfWindowExpired(session.interview);
    const fresh = await this.context.findSessionOrThrow(session.id);
    this.context.assertWindowOpen(fresh.interview);
    this.context.assertNotSubmitted(fresh);

    return {
      id: fresh.id,
      inviteToken: fresh.invite_token,
      candidateJoinUrl: this.context.candidateUrl(fresh.invite_token),
      timeLimitMinutes: fresh.time_limit_minutes,
      instructions: fresh.instructions,
      attemptStatus: fresh.attempt_status,
      maxScore: fresh.max_score,
      questionCount: fresh.questions.length,
      interview: {
        title: fresh.interview.title,
        status: fresh.interview.status,
        scheduledAt: fresh.interview.scheduled_at,
        endsAt: fresh.interview.ends_at,
        candidate: {
          firstName: fresh.interview.candidate.first_name,
          lastName: fresh.interview.candidate.last_name,
        },
        interviewer: {
          firstName: fresh.interview.interviewer.first_name,
          lastName: fresh.interview.interviewer.last_name,
        },
      },
    };
  }

  async enterAsGuest(token: string) {
    const session = await this.findByInviteToken(token);
    await this.context.closeIfWindowExpired(session.interview);
    const live = await this.context.findSessionOrThrow(session.id);
    this.context.assertWindowOpen(live.interview);
    this.context.assertNotSubmitted(live);

    const user = await this.guestAccess.resolveCandidateUser(
      live.interview.candidate,
      live.interview.company_id,
    );

    const accessToken = await this.guestAccess.issueGuestToken(user, {
      type: 'tech-guest',
      technicalInterviewId: live.id,
      inviteToken: token,
    });

    return {
      accessToken,
      technicalInterviewId: live.id,
      takePath: `/technical-interview/${live.id}/take`,
      user: {
        userId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: 'Candidate',
        permissions: ['TechnicalInterview.Take'],
        isGuest: true,
        technicalInterviewId: live.id,
      },
    };
  }

  private async findByInviteToken(token: string) {
    const session = await this.prisma.technicalInterview.findUnique({
      where: { invite_token: token },
      include: technicalInterviewDetailInclude,
    });
    if (!session) {
      throw new NotFoundException('Invite link is invalid or expired.');
    }
    return session;
  }
}
