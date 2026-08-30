import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from './decorators/current-user.decorator';

const NARROW_ROLES = ['INTERVIEWER', 'CANDIDATE'] as const;

export function isBroadStaffRole(role: string) {
  return !(NARROW_ROLES as readonly string[]).includes(role);
}

/** Users who can be picked as interviewers, including custom roles. */
export function interviewerRoleWhere(): Prisma.RoleWhereInput {
  return {
    OR: [
      { name: { in: ['INTERVIEWER', 'HR', 'COMPANY_ADMIN'] } },
      {
        is_system: false,
        rolePermissions: {
          some: {
            permission: {
              code: { in: ['Interview.Conduct', 'LiveInterview.Join'] },
            },
          },
        },
      },
    ],
  };
}

/**
 * Interviews a staff user is allowed to see: everything in their company for
 * admin/HR roles, otherwise only sessions they run or attend.
 */
export function interviewScopeWhere(user: AuthUser): Prisma.InterviewWhereInput {
  if (user.isGuest) {
    throw new ForbiddenException(
      'Candidates can only access their invite link.',
    );
  }

  const companyScope: Prisma.InterviewWhereInput =
    user.role === 'SUPER_ADMIN' && !user.companyId
      ? {}
      : { company_id: user.companyId ?? undefined };

  if (isBroadStaffRole(user.role)) {
    return companyScope;
  }

  return {
    ...companyScope,
    OR: [
      { interviewer_id: user.userId },
      { candidate: { user_id: user.userId } },
    ],
  };
}

export function assertPermission(user: AuthUser, permission: string) {
  if (user.isGuest) {
    throw new ForbiddenException(
      'Candidates can only access their invite link.',
    );
  }
  if (!user.permissions.includes(permission)) {
    throw new ForbiddenException(`${permission} permission required.`);
  }
}
