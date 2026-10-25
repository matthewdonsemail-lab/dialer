import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type TextMessage } from "@/domains/api/client";
import { useToast } from "@/domains/ui/toast";
import { isNotificationSupported } from "@/domains/dialer/notifications";

export interface InboundSmsNotificationOptions {
  from: string;
  body: string;
  onClick?: () => void;
}

export function showInboundSmsNotification(options: InboundSmsNotificationOptions): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;

  try {
    const notification = new Notification(`New SMS from ${options.from}`, {
      body: options.body,
      icon: "/favicon.ico",
      tag: `sms-${Date.now()}`,
    });

    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignored
      }
      options.onClick?.();
      notification.close();
    };

    return notification;
  } catch {
    return null;
  }
}

/**
 * Polls for newly arrived inbound SMS messages and notifies the operator via
 * toast and system desktop notifications.
 */
export function useInboundSmsNotifications(enabled = true) {
  const { info: toastInfo } = useToast();
  const queryClient = useQueryClient();
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  const { data: recentMessages } = useQuery({
    queryKey: ["recentInboundMessages"],
    queryFn: () => api.messages.recentInbound(),
    enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!recentMessages || !recentMessages.length) return;

    if (initialLoadRef.current) {
      // First load: seed seen IDs without alerting for old texts
      for (const msg of recentMessages) {
        seenIdsRef.current.add(msg.id);
      }
      initialLoadRef.current = false;
      return;
    }

    for (const msg of recentMessages) {
      if (!seenIdsRef.current.has(msg.id) && msg.direction === "INBOUND") {
        seenIdsRef.current.add(msg.id);

        const snippet = msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body;
        const sender = msg.fromNumber || "Unknown";

        toastInfo(`💬 SMS from ${sender}`, snippet);
        showInboundSmsNotification({
          from: sender,
          body: snippet,
        });

        // Invalidate message threads so open conversation feeds refresh immediately
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      }
    }
  }, [recentMessages, toastInfo, queryClient]);

  const simulateInbound = async (data?: { from?: string; to?: string; body?: string }) => {
    return api.messages.simulateInbound(data ?? {
      from: "+61 412 345 678",
      to: "+61 2 9123 4567",
      body: "Hi! Following up regarding your Australian business services.",
    });
  };

  return { simulateInbound };
}
