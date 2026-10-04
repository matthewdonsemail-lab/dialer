export interface DialerMeMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface DialerMeResponse {
  id: string;
  email: string;
  fullName: string;
  role: string;
  twentyUserId?: string;
  workspaceMemberId?: string | null;
  member?: DialerMeMember;
}
