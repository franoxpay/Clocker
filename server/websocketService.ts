import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const clients = new Map<string, Set<WebSocketClient>>();
let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocketClient, req) => {
    ws.isAlive = true;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "auth" && message.userId) {
          ws.userId = message.userId;
          
          if (!clients.has(message.userId)) {
            clients.set(message.userId, new Set());
          }
          clients.get(message.userId)?.add(ws);
          
          ws.send(JSON.stringify({ type: "connected", status: "ok" }));
          console.log(`[WS] User ${message.userId} connected`);
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    });

    ws.on("close", () => {
      if (ws.userId) {
        clients.get(ws.userId)?.delete(ws);
        if (clients.get(ws.userId)?.size === 0) {
          clients.delete(ws.userId);
        }
        console.log(`[WS] User ${ws.userId} disconnected`);
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err);
    });
  });

  const interval = setInterval(() => {
    wss?.clients.forEach((ws: WebSocketClient) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  console.log("[WS] WebSocket server initialized on /ws");
}

export function sendToUser(userId: string, data: object) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;

  const message = JSON.stringify(data);
  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function broadcastToAll(data: object) {
  if (!wss) return;
  
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export type NotificationType = 
  | "new_notification"
  | "click_warning"
  | "domain_verified"
  | "domain_error"
  | "subscription_updated"
  | "click_limit_reached";

export function sendNotification(
  userId: string,
  type: NotificationType,
  payload: object
) {
  sendToUser(userId, {
    type: "notification",
    notificationType: type,
    payload,
    timestamp: Date.now(),
  });
}

export const WebSocketService = {
  setup: setupWebSocket,
  sendToUser,
  broadcastToAll,
  sendNotification,
};
