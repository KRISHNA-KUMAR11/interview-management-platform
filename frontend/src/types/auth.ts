export interface AuthUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyId?: string | null;
  permissions: string[];
  isGuest?: boolean;
  liveInterviewId?: string;
  technicalInterviewId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}
