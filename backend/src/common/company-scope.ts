import { BadRequestException } from '@nestjs/common';
import { AuthUser } from './decorators/current-user.decorator';

export function requireCompanyContext(
  user: AuthUser,
  message = 'Company context is required.',
) {
  if (!user.companyId) {
    throw new BadRequestException(message);
  }
  return user.companyId;
}
