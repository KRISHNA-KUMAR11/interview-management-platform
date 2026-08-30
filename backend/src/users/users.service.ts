import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '../common/decorators/current-user.decorator';
import {
  buildPaginatedResult,
  isPaginationRequested,
  resolvePagination,
} from '../common/dto/pagination.dto';
import { assertPermission } from '../common/interview-scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './dto/user.dto';

const USER_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  status: true,
  last_login_at: true,
  created_at: true,
  company_id: true,
  role: { select: { id: true, name: true, display_name: true } },
  company: { select: { id: true, name: true } },
  _count: {
    select: { interviewsAssigned: true, interviewsCreated: true },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private isPlatformAdmin(user: AuthUser) {
    return user.role === 'SUPER_ADMIN' && !user.companyId;
  }

  /** Users the caller may see: their own company, or everyone for a super admin. */
  private scopeWhere(user: AuthUser): Prisma.UserWhereInput {
    return this.isPlatformAdmin(user)
      ? {}
      : { company_id: user.companyId ?? undefined };
  }

  private toResponse(row: UserRow) {
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      status: row.status,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      roleId: row.role.id,
      roleName: row.role.name,
      roleDisplayName: row.role.display_name,
      companyId: row.company_id,
      companyName: row.company?.name ?? null,
      interviewCount:
        row._count.interviewsAssigned + row._count.interviewsCreated,
    };
  }

  private async assertRoleAssignable(user: AuthUser, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Role not found.');

    if (role.name === 'SUPER_ADMIN' && !this.isPlatformAdmin(user)) {
      throw new ForbiddenException(
        'Only a platform super admin can grant the Super Admin role.',
      );
    }

    return role;
  }

  private async findInScope(id: string, user: AuthUser) {
    const target = await this.prisma.user.findFirst({
      where: { id, ...this.scopeWhere(user) },
      select: USER_SELECT,
    });
    if (!target) throw new NotFoundException('User not found.');
    return target;
  }

  async listRoles(user: AuthUser) {
    assertPermission(user, 'User.View');

    const roles = await this.prisma.role.findMany({
      select: { id: true, name: true, display_name: true, description: true },
      orderBy: { name: 'asc' },
    });

    return roles
      .filter(
        (role) => role.name !== 'SUPER_ADMIN' || this.isPlatformAdmin(user),
      )
      .map((role) => ({
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
      }));
  }

  async list(user: AuthUser, query: ListUsersQueryDto = {}) {
    assertPermission(user, 'User.View');

    const term = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...this.scopeWhere(user),
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(term
        ? {
            OR: [
              { first_name: { contains: term } },
              { last_name: { contains: term } },
              { email: { contains: term } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      created_at: 'desc',
    };

    if (!isPaginationRequested(query)) {
      const rows = await this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy,
      });
      return rows.map((row) => this.toResponse(row));
    }

    const pagination = resolvePagination(query);
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      pagination,
    );
  }

  async getById(id: string, user: AuthUser) {
    assertPermission(user, 'User.View');
    return this.toResponse(await this.findInScope(id, user));
  }

  async create(dto: CreateUserDto, user: AuthUser) {
    assertPermission(user, 'User.Create');
    await this.assertRoleAssignable(user, dto.roleId);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with that email already exists.');
    }

    const companyId = this.isPlatformAdmin(user)
      ? (dto.companyId ?? null)
      : (user.companyId ?? null);

    const saltRounds = Number(
      this.configService.get('BCRYPT_SALT_ROUNDS') ?? 12,
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const created = await this.prisma.user.create({
      data: {
        first_name: dto.firstName.trim(),
        last_name: dto.lastName.trim(),
        email,
        password_hash: passwordHash,
        role_id: dto.roleId,
        company_id: companyId,
        status: UserStatus.ACTIVE,
      },
      select: USER_SELECT,
    });

    return this.toResponse(created);
  }

  async update(id: string, dto: UpdateUserDto, user: AuthUser) {
    assertPermission(user, 'User.Edit');
    const target = await this.findInScope(id, user);

    if (dto.roleId) {
      await this.assertRoleAssignable(user, dto.roleId);
    }

    if (id === user.userId && dto.status && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    if (
      id === user.userId &&
      dto.roleId &&
      dto.roleId !== target.role.id
    ) {
      throw new BadRequestException('You cannot change your own role.');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        first_name: dto.firstName?.trim(),
        last_name: dto.lastName?.trim(),
        role_id: dto.roleId,
        status: dto.status,
      },
      select: USER_SELECT,
    });

    return this.toResponse(updated);
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto, user: AuthUser) {
    assertPermission(user, 'User.Edit');
    await this.findInScope(id, user);

    const saltRounds = Number(
      this.configService.get('BCRYPT_SALT_ROUNDS') ?? 12,
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user_id: id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    ]);

    return { id, passwordReset: true };
  }

  async remove(id: string, user: AuthUser) {
    assertPermission(user, 'User.Delete');

    if (id === user.userId) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    const target = await this.findInScope(id, user);

    if (target._count.interviewsAssigned + target._count.interviewsCreated > 0) {
      throw new BadRequestException(
        'This user is linked to interviews. Set the account to INACTIVE instead of deleting it.',
      );
    }

    await this.prisma.user.delete({ where: { id } });
    return { id, deleted: true };
  }
}
