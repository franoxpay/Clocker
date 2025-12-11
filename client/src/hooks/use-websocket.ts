import { useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "./useAuth";

type MessageHandler = (data: any) => void;

interface UseWebSocketOptions {
  onNotification?: MessageHandler;
  onClickWarning?: MessageHandler;
  onDomainVerified?: MessageHandler;
  onSubscriptionUpdated?: MessageHandler;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!user?.id) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", userId: user.id }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "connected") {
          setIsConnected(true);
          return;
        }
        
        if (data.type === "notification") {
          switch (data.notificationType) {
            case "new_notification":
            case "click_limit_reached":
              options.onNotification?.(data.payload);
              break;
            case "click_warning":
              options.onClickWarning?.(data.payload);
              break;
            case "domain_verified":
            case "domain_error":
              options.onDomainVerified?.(data.payload);
              break;
            case "subscription_updated":
              options.onSubscriptionUpdated?.(data.payload);
              break;
          }
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }, [user?.id, options]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
