export interface BarkPushOptions {
  title?: string;
  subtitle?: string;
  body: string;
  group?: string;
  url?: string;
  level?: "active" | "timeSensitive" | "passive" | "critical";
  sound?: string;
  badge?: number;
  icon?: string;
}

export interface BarkPushResult {
  ok: boolean;
  status: number;
  message: string;
}