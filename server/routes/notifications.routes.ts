import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";

export function registerNotificationRoutes(app: Express): void {
  app.get("/api/logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offerId = req.query.offerId && req.query.offerId !== "all" ? parseInt(req.query.offerId as string) : undefined;
      const redirectType = req.query.redirectType && req.query.redirectType !== "all" ? req.query.redirectType as string : undefined;
      const reason = req.query.reason && req.query.reason !== "all" ? req.query.reason as string : undefined;

      const result = await storage.getClickLogs(userId, page, limit, { offerId, redirectType, reason });
      res.json(result);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const notifications = await storage.getNotificationsByUserId(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const notificationId = parseInt(req.params.id);
      await storage.markNotificationAsRead(notificationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
