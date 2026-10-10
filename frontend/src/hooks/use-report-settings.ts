import { usePersistedState } from "@/hooks/use-persisted-state";

export const DEFAULT_CALL_GOAL = 100;
export const DEFAULT_CONVERSATION_SECONDS = 60;

/**
 * Report goals, set under Settings -> Reports. Saved per browser.
 *   - dailyCallGoal: outbound calls each member aims for per day
 *   - conversationSeconds: how long a connected call must last to count as a conversation
 */
export function useReportSettings() {
  const [dailyCallGoal, setDailyCallGoal] = usePersistedState("reports-daily-call-goal", DEFAULT_CALL_GOAL);
  const [conversationSeconds, setConversationSeconds] = usePersistedState(
    "reports-conversation-seconds",
    DEFAULT_CONVERSATION_SECONDS,
  );
  return { dailyCallGoal, setDailyCallGoal, conversationSeconds, setConversationSeconds };
}
