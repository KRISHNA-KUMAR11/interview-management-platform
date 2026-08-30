import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertPermission } from '../common/interview-scope';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoleDto,
  UpdateCompanyDto,
  UpdateProfileDto,
  UpdateRoleDto,
} from './dto/settings.dto';

const RESERVED_ROLE_NAMES = new Set([
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'HR',
  'INTERVIEWER',
  'CANDIDATE',
]);

function toRoleName(displayName: string) {
  const name = displayName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (name.length < 2) {
    throw new BadRequestException(
      'Role name must contain at least two letters or numbers.',
    );
  }
  if (RESERVED_ROLE_NAMES.has(name)) {
    throw new BadRequestException(
      'That name is reserved for a built-in role. Choose a different display name.',
    );
  }
  return name;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser) {
    assertPermission(user, 'Settings.View');

    const [profile, company, roles, catalog] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          status: true,
          last_login_at: true,
          created_at: true,
          role: { select: { name: true, display_name: true } },
        },
      }),
      user.companyId
        ? this.prisma.company.findUnique({
            where: { id: user.companyId },
            select: {
              id: true,
              name: true,
              slug: true,
              is_active: true,
              created_at: true,
              _count: {
                select: {
                  users: true,
                  candidates: true,
                  interviews: true,
                  questions: true,
                },
              },
            },
          })
        : Promise.resolve(null),
      this.prisma.role.findMany({
        select: {
          id: true,
          name: true,
          display_name: true,
          description: true,
          is_system: true,
          _count: { select: { users: true, rolePermissions: true } },
          rolePermissions: {
            select: { permission: { select: { code: true } } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.permission.findMany({
        select: {
          code: true,
          module: true,
          action: true,
          description: true,
        },
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      }),
    ]);

    if (!profile) throw new NotFoundException('Profile not found.');

    return {
      profile: {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        email: profile.email,
        status: profile.status,
        lastLoginAt: profile.last_login_at,
        createdAt: profile.created_at,
        roleName: profile.role.name,
        roleDisplayName: profile.role.display_name,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            slug: company.slug,
            isActive: company.is_active,
            createdAt: company.created_at,
            counts: {
              users: company._count.users,
              candidates: company._count.candidates,
              interviews: company._count.interviews,
              questions: company._count.questions,
            },
          }
        : null,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
        isSystem: role.is_system,
        userCount: role._count.users,
        permissionCount: role._count.rolePermissions,
        permissionCodes: role.rolePermissions.map((row) => row.permission.code),
      })),
      availablePermissions: catalog,
      permissions: user.permissions,
      canEditCompany: user.permissions.includes('Settings.Edit'),
      canManageRoles: user.permissions.includes('Settings.Edit'),
    };
  }

  async updateCompany(dto: UpdateCompanyDto, user: AuthUser) {
    assertPermission(user, 'Settings.Edit');
    if (!user.companyId) {
      throw new BadRequestException('No company is linked to this account.');
    }
    if (!dto.name) {
      throw new BadRequestException('Nothing to update.');
    }

    await this.prisma.company.update({
      where: { id: user.companyId },
      data: { name: dto.name.trim() },
    });

    return this.get(user);
  }

  async updateProfile(dto: UpdateProfileDto, user: AuthUser) {
    assertPermission(user, 'Settings.View');
    if (!dto.firstName && !dto.lastName) {
      throw new BadRequestException('Nothing to update.');
    }

    await this.prisma.user.update({
      where: { id: user.userId },
      data: {
        first_name: dto.firstName?.trim(),
        last_name: dto.lastName?.trim(),
      },
    });

    return this.get(user);
  }

  async createRole(dto: CreateRoleDto, user: AuthUser) {
    assertPermission(user, 'Settings.Edit');
    const displayName = dto.displayName.trim();
    const name = toRoleName(displayName);
    const permissionIds = await this.resolvePermissionIds(dto.permissionCodes);

    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('A role with that name already exists.');
    }

    await this.prisma.role.create({
      data: {
        name,
        display_name: displayName,
        description: dto.description?.trim() || null,
        is_system: false,
        rolePermissions: {
          create: permissionIds.map((permission_id) => ({ permission_id })),
        },
      },
    });

    return this.get(user);
  }

  async updateRole(id: string, dto: UpdateRoleDto, user: AuthUser) {
    assertPermission(user, 'Settings.Edit');
    const role = await this.prisma.role.findUnique({
      where: { id },
    });
    if (!role) throw new NotFoundException('Role not found.');
    if (role.is_system) {
      throw new BadRequestException('Built-in roles cannot be edited.');
    }
    if (!dto.displayName && dto.description === undefined && !dto.permissionCodes) {
      throw new BadRequestException('Nothing to update.');
    }

    const displayName = dto.displayName?.trim();
    const nextName = displayName ? toRoleName(displayName) : undefined;
    if (nextName && nextName !== role.name) {
      const clash = await this.prisma.role.findUnique({
        where: { name: nextName },
      });
      if (clash) {
        throw new ConflictException('A role with that name already exists.');
      }
    }

    const permissionIds = dto.permissionCodes
      ? await this.resolvePermissionIds(dto.permissionCodes)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(displayName ? { display_name: displayName, name: nextName } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
        },
      });

      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { role_id: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permission_id) => ({
            role_id: id,
            permission_id,
          })),
        });
      }
    });

    return this.get(user);
  }

  async deleteRole(id: string, user: AuthUser) {
    assertPermission(user, 'Settings.Edit');
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found.');
    if (role.is_system) {
      throw new BadRequestException('Built-in roles cannot be deleted.');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        'Reassign users on this role before deleting it.',
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return this.get(user);
  }

  private async resolvePermissionIds(codes: string[]) {
    const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (unique.length === 0) {
      throw new BadRequestException('Select at least one permission.');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: unique } },
      select: { id: true, code: true },
    });
    if (permissions.length !== unique.length) {
      throw new BadRequestException('One or more permissions are not valid.');
    }
    return permissions.map((permission) => permission.id);
  }
}
