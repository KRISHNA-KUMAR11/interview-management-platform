export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserPayload {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyId: string | null;
  permissions: string[];
}

export interface LoginResult extends AuthTokens {
  user: AuthUserPayload;
}
