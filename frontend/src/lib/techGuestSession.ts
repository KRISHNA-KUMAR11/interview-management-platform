import type { AuthUser } from '../types/auth';

const TECH_GUEST_TOKEN_KEY = 'imp_tech_guest_access_token';
const TECH_GUEST_USER_KEY = 'imp_tech_guest_user';
const TECH_GUEST_ID_KEY = 'imp_tech_guest_interview_id';

export interface TechGuestUser extends AuthUser {
  isGuest: true;
  technicalInterviewId: string;
}

export const techGuestSession = {
  getToken(): string | null {
    return sessionStorage.getItem(TECH_GUEST_TOKEN_KEY);
  },
  getTechnicalInterviewId(): string | null {
    return sessionStorage.getItem(TECH_GUEST_ID_KEY);
  },
  getUser(): TechGuestUser | null {
    const raw = sessionStorage.getItem(TECH_GUEST_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TechGuestUser;
    } catch {
      return null;
    }
  },
  set(accessToken: string, technicalInterviewId: string, user: TechGuestUser) {
    sessionStorage.setItem(TECH_GUEST_TOKEN_KEY, accessToken);
    sessionStorage.setItem(TECH_GUEST_ID_KEY, technicalInterviewId);
    sessionStorage.setItem(TECH_GUEST_USER_KEY, JSON.stringify(user));
  },
  clear() {
    sessionStorage.removeItem(TECH_GUEST_TOKEN_KEY);
    sessionStorage.removeItem(TECH_GUEST_ID_KEY);
    sessionStorage.removeItem(TECH_GUEST_USER_KEY);
  },
  isActiveFor(technicalInterviewId: string) {
    return (
      Boolean(this.getToken()) &&
      this.getTechnicalInterviewId() === technicalInterviewId
    );
  },
};
