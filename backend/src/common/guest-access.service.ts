import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

interface GuestCandidate {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
}

interface GuestTokenUser {
  id: string;
  email: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
}

@Injectable()
export class GuestAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async resolveCandidateUser(candidate: GuestCandidate, companyId: string) {
    let userId = candidate.user_id;

    if (!userId) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: candidate.email.toLowerCase() },
      });

      if (existingUser) {
        userId = existingUser.id;
        await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: { user_id: userId },
        });
      } else {
        const candidateRole = await this.prisma.role.findUnique({
          where: { name: 'CANDIDATE' },
        });
        if (!candidateRole) {
          throw new BadRequestException('Candidate role is not configured.');
        }

        const passwordHash = await bcrypt.hash(
          randomBytes(24).toString('hex'),
          12,
        );
        const createdUser = await this.prisma.user.create({
          data: {
            email: candidate.email.toLowerCase(),
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            password_hash: passwordHash,
            role_id: candidateRole.id,
            company_id: companyId,
            status: 'ACTIVE',
          },
        });

        await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: { user_id: createdUser.id },
        });
        userId = createdUser.id;
      }
    }

    return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  async issueGuestToken(
    user: GuestTokenUser,
    claims: Record<string, unknown>,
  ) {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: 'CANDIDATE',
        companyId: user.company_id,
        firstName: user.first_name,
        lastName: user.last_name,
        ...claims,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '8h' as `${number}h`,
      },
    );
  }
}
