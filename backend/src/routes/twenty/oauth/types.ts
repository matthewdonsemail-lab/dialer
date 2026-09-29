export interface TokenRequestBody {
  code?: string;
  verifier?: string;
  redirectUri?: string;
}

export interface RefreshRequestBody {
  refreshToken?: string;
}

export interface SessionRequestBody {
  accessToken?: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface SessionResponse {
  user: SessionUser;
  token: string;
}
