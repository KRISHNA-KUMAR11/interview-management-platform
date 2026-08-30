import { randomBytes } from 'crypto';

export function generateInviteToken() {
  return randomBytes(24).toString('hex');
}

export function generateRoomCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}
