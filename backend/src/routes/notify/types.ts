export interface BarkNotifyBody {
  email?: string;
  userId?: string;
  workspaceMemberId?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  group?: string;
  url?: string;
  level?: "active" | "timeSensitive" | "passive" | "critical";
}