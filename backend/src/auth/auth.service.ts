import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  AuthTokens,
  AuthUserPayload,
  LoginResult,
} from './interfaces/auth.interfaces';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
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

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    const passwordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const permissions = user.role.rolePermissions.map(
      (rp) => rp.permission.code,
    );

    const tokens = await this.issueTokens({
      userId: user.id,
      email: user.email,
      role: user.role.name,
      companyId: user.company_id,
      permissions,
    });

    await this.storeRefreshToken(user.id, tokens.refreshToken, meta);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return {
      ...tokens,
      user: {
        userId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role.display_name,
        companyId: user.company_id,
        permissions,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!stored || stored.revoked_at) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date() },
    });
  }

  async refreshToken(
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthTokens & { user: AuthUserPayload }> {
    let payload: { sub: string; email: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!stored || stored.revoked_at || stored.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
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
      throw new UnauthorizedException('User account is not available.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date() },
    });

    const permissions = user.role.rolePermissions.map(
      (rp) => rp.permission.code,
    );

    const tokens = await this.issueTokens({
      userId: user.id,
      email: user.email,
      role: user.role.name,
      companyId: user.company_id,
      permissions,
    });

    await this.storeRefreshToken(user.id, tokens.refreshToken, meta);

    return {
      ...tokens,
      user: {
        userId: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role.display_name,
        companyId: user.company_id,
        permissions,
      },
    };
  }

  async getProfile(userId: string): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return {
      userId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role.display_name,
      companyId: user.company_id,
      permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success to avoid email enumeration
    if (!user) {
      return {};
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    // In production, send email. For development, return token.
    const isDev = this.configService.get('NODE_ENV') !== 'production';
    return isDev ? { resetToken: rawToken } : {};
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!stored || stored.used_at || stored.expires_at < new Date()) {
      throw new BadRequestException('Invalid or expired reset token.');
    }

    const saltRounds = Number(
      this.configService.get('BCRYPT_SALT_ROUNDS') ?? 12,
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.user_id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { used_at: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user_id: stored.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    const saltRounds = Number(
      this.configService.get('BCRYPT_SALT_ROUNDS') ?? 12,
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password_hash: passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);
  }

  private async issueTokens(input: {
    userId: string;
    email: string;
    role: string;
    companyId: string | null;
    permissions: string[];
  }): Promise<AuthTokens> {
    const payload = {
      sub: input.userId,
      email: input.email,
      role: input.role,
      companyId: input.companyId,
    };

    const accessExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
      }),
      this.jwtService.signAsync(
        { sub: input.userId, email: input.email },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<void> {
    const expiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const expiresAt = this.resolveExpiryDate(expiresIn);

    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: this.hashToken(refreshToken),
        expires_at: expiresAt,
        user_agent: meta?.userAgent,
        ip_address: meta?.ipAddress,
      },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveExpiryDate(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }
}
