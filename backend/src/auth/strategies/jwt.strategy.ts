import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  companyId?: string | null;
  type?: 'user' | 'guest' | 'tech-guest';
  liveInterviewId?: string;
  technicalInterviewId?: string;
  firstName?: string;
  lastName?: string;
  inviteToken?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type === 'guest') {
      if (!payload.liveInterviewId || !payload.inviteToken) {
        throw new UnauthorizedException('Invalid guest session.');
      }

      const live = await this.prisma.liveInterview.findUnique({
        where: { id: payload.liveInterviewId },
        include: { interview: true },
      });

      if (!live || live.invite_token !== payload.inviteToken) {
        throw new UnauthorizedException('Invite link is invalid.');
      }

      if (
        live.interview.status === 'COMPLETED' ||
        live.interview.status === 'CANCELLED'
      ) {
        throw new UnauthorizedException(
          'This interview is completed. The invite link is no longer valid.',
        );
      }

      const now = Date.now();
      if (now < live.interview.scheduled_at.getTime()) {
        throw new UnauthorizedException(
          'This interview link is not open yet.',
        );
      }
      if (now > live.interview.ends_at.getTime()) {
        throw new UnauthorizedException(
          'This interview window has expired. The link is closed.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Guest session is invalid.');
      }

      return {
        userId: user.id,
        email: user.email,
        role: 'CANDIDATE',
        companyId: user.company_id,
        permissions: ['LiveInterview.Join', 'Interview.Attend'],
        isGuest: true,
        liveInterviewId: live.id,
        firstName: user.first_name,
        lastName: user.last_name,
      };
    }

    if (payload.type === 'tech-guest') {
      if (!payload.technicalInterviewId || !payload.inviteToken) {
        throw new UnauthorizedException('Invalid assessment session.');
      }

      const tech = await this.prisma.technicalInterview.findUnique({
        where: { id: payload.technicalInterviewId },
        include: { interview: true },
      });

      if (!tech || tech.invite_token !== payload.inviteToken) {
        throw new UnauthorizedException('Invite link is invalid.');
      }

      if (
        tech.attempt_status === 'SUBMITTED' ||
        tech.attempt_status === 'REVIEWED' ||
        tech.attempt_status === 'EXPIRED'
      ) {
        throw new UnauthorizedException(
          'This assessment is closed. The invite link is no longer valid.',
        );
      }

      const now = Date.now();
      if (now < tech.interview.scheduled_at.getTime()) {
        throw new UnauthorizedException('This assessment is not open yet.');
      }
      if (now > tech.interview.ends_at.getTime()) {
        throw new UnauthorizedException(
          'This assessment window has expired.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Guest session is invalid.');
      }

      return {
        userId: user.id,
        email: user.email,
        role: 'CANDIDATE',
        companyId: user.company_id,
        permissions: ['TechnicalInterview.Take'],
        isGuest: true,
        technicalInterviewId: tech.id,
        firstName: user.first_name,
        lastName: user.last_name,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Authentication required.');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role.name,
      companyId: user.company_id,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
      isGuest: false,
    };
  }
}
