import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  companyId: string | null;
  permissions: string[];
  isGuest?: boolean;
  liveInterviewId?: string;
  technicalInterviewId?: string;
  firstName?: string;
  lastName?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
