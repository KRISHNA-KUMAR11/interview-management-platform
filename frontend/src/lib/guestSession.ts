import type { AuthUser } from '../types/auth';

const GUEST_TOKEN_KEY = 'imp_guest_access_token';
const GUEST_USER_KEY = 'imp_guest_user';
const GUEST_LIVE_ID_KEY = 'imp_guest_live_interview_id';

export interface GuestUser extends AuthUser {
  isGuest: true;
  liveInterviewId: string;
}

export const guestSession = {
  getToken(): string | null {
    return sessionStorage.getItem(GUEST_TOKEN_KEY);
  },
  getLiveInterviewId(): string | null {
    return sessionStorage.getItem(GUEST_LIVE_ID_KEY);
  },
  getUser(): GuestUser | null {
    const raw = sessionStorage.getItem(GUEST_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GuestUser;
    } catch {
      return null;
    }
  },
  set(accessToken: string, liveInterviewId: string, user: GuestUser) {
    sessionStorage.setItem(GUEST_TOKEN_KEY, accessToken);
    sessionStorage.setItem(GUEST_LIVE_ID_KEY, liveInterviewId);
    sessionStorage.setItem(GUEST_USER_KEY, JSON.stringify(user));
  },
  clear() {
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
    sessionStorage.removeItem(GUEST_LIVE_ID_KEY);
    sessionStorage.removeItem(GUEST_USER_KEY);
  },
  isActiveFor(liveInterviewId: string) {
    return (
      Boolean(this.getToken()) && this.getLiveInterviewId() === liveInterviewId
    );
  },
};
