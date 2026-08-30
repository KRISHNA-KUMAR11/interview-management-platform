export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED' | 'PENDING';

export interface RoleOption {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
}

export interface PlatformUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  roleId: string;
  roleName: string;
  roleDisplayName: string;
  companyId: string | null;
  companyName: string | null;
  interviewCount: number;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  roleId: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  roleId?: string;
  status?: UserStatus;
}
