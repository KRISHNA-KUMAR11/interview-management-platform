import { Injectable, NotFoundException } from '@nestjs/common';
import { InterviewStatus, ParticipantRole } from '@prisma/client';
import { GuestAccessService } from '../common/guest-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  liveInterviewDetailInclude,
  LiveInterviewContextService,
} from './live-interview-context.service';

@Injectable()
export class LiveInterviewAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: LiveInterviewContextService,
    private readonly guestAccess: GuestAccessService,
  ) {}

  async getByInviteToken(token: string) {
    const session = await this.findByInviteToken(token);

    await this.context.closeInterviewIfWindowExpired(session.interview);
    const fresh = await this.context.findSessionOrThrow(session.id);
    this.context.assertInviteWindowOpen(fresh.interview);

    const mapped = this.context.mapSession(fresh);
    return {
      id: mapped.id,
      roomCode: mapped.roomCode,
      inviteToken: mapped.inviteToken,
      candidateJoinUrl: mapped.candidateJoinUrl,
      interview: {
        title: mapped.interview.title,
        status: mapped.interview.status,
        scheduledAt: mapped.interview.scheduledAt,
        endsAt: mapped.interview.endsAt,
        durationMinutes: mapped.interview.durationMinutes,
        candidate: {
          firstName: mapped.interview.candidate.firstName,
          lastName: mapped.interview.candidate.lastName,
          email: mapped.interview.candidate.email,
        },
        interviewer: {
          firstName: mapped.interview.interviewer.firstName,
          lastName: mapped.interview.interviewer.lastName,
        },
      },
    };
  }

  /**
   * Candidate enters via invite link — no password/login required.
   * Issues a short-lived guest JWT scoped to this interview only.
   */
  async enterAsGuest(token: string) {
    const session = await this.findByInviteToken(token);

    await this.context.closeInterviewIfWindowExpired(session.interview);
    const live = await this.context.findSessionOrThrow(session.id);
    this.context.assertInviteWindowOpen(live.interview);

    const user = await this.guestAccess.resolveCandidateUser(
      live.interview.candidate,
      live.interview.company_id,
    );

    const existingParticipant =
      await this.prisma.liveInterviewParticipant.findUnique({
        where: {
          live_interview_id_user_id: {
            live_interview_id: live.id,
            user_id: user.id,
          },
        },
      });

    if (!existingParticipant) {
      await this.prisma.liveInterviewParticipant.create({
        data: {
          live_interview_id: live.id,
          user_id: user.id,
          role: ParticipantRole.CANDIDATE,
          joined_at: new Date(),
        },
      });
    }

    if (live.interview.status === InterviewStatus.SCHEDULED) {
      await this.prisma.interview.update({
        where: { id: live.interview_id },
        data: { status: InterviewStatus.WAITING },
      });
    }

    const accessToken = await this.guestAccess.issueGuestToken(user, {
      type: 'guest',
      liveInterviewId: live.id,
      inviteToken: token,
    });

    await this.prisma.liveInterviewEvent.create({
      data: {
        live_interview_id: live.id,
        actor_user_id: user.id,
        event_type: 'guest_joined',
        message: 'Candidate joined via invite link (no login)',
      },
    });

    return {
      accessToken,
      liveInterviewId: live.id,
      lobbyPath: `/live-interview/${live.id}/lobby`,
      user: {
        userId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: 'Candidate',
        permissions: ['LiveInterview.Join', 'Interview.Attend'],
        isGuest: true,
        liveInterviewId: live.id,
      },
    };
  }

  private async findByInviteToken(token: string) {
    const session = await this.prisma.liveInterview.findUnique({
      where: { invite_token: token },
      include: liveInterviewDetailInclude,
    });

    if (!session) {
      throw new NotFoundException('Invite link is invalid or expired.');
    }

    return session;
  }
}
