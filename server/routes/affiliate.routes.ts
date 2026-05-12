import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";

export function registerAffiliateRoutes(app: Express): void {
  // Affiliate stats endpoint for user dashboard
  app.get("/api/affiliate/stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const stats = await storage.getAffiliateStats(userId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching affiliate stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Validate coupon (GET - basic validation for frontend preview)
  app.get("/api/coupons/validate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const code = req.query.code as string;

      if (!code) {
        return res.status(400).json({ message: "Code is required" });
      }

      const coupon = await storage.getCouponByCode(code);
      
      if (!coupon) {
        return res.status(400).json({ message: "Coupon not found", error: "coupon_not_found" });
      }

      if (!coupon.isActive) {
        return res.status(400).json({ message: "Coupon is no longer active", error: "coupon_inactive" });
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Coupon has expired", error: "coupon_expired" });
      }

      const user = await storage.getUser(userId);
      if (user?.hasUsedCoupon) {
        return res.status(400).json({ message: "You have already used a coupon", error: "user_already_used_coupon" });
      }

      if (coupon.affiliateUserId === userId) {
        return res.status(400).json({ message: "You cannot use your own referral coupon", error: "cannot_use_own_coupon" });
      }

      if (coupon.affiliateUserId) {
        const affiliate = await storage.getUser(coupon.affiliateUserId);
        if (!affiliate || affiliate.subscriptionStatus !== "active") {
          return res.status(400).json({ message: "This referral coupon is temporarily unavailable", error: "affiliate_inactive" });
        }
      }

      res.json({
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        validPlanIds: coupon.validPlanIds,
      });
    } catch (error) {
      console.error("Error validating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Validate coupon (POST - full validation for checkout)
  app.post("/api/coupons/validate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { code, planId } = req.body;

      if (!code || !planId) {
        return res.status(400).json({ message: "Code and planId are required" });
      }

      const result = await storage.validateCouponForUser(code, userId, planId);
      
      if (!result.valid) {
        const errorMessages: Record<string, string> = {
          coupon_not_found: "Coupon not found",
          coupon_inactive: "Coupon is no longer active",
          coupon_expired: "Coupon has expired",
          coupon_invalid_plan: "Coupon is not valid for this plan",
          user_already_used_coupon: "You have already used a coupon",
          cannot_use_own_coupon: "You cannot use your own referral coupon",
          affiliate_inactive: "This referral coupon is temporarily unavailable",
        };
        return res.status(400).json({ 
          message: errorMessages[result.error!] || "Invalid coupon",
          error: result.error,
        });
      }

      const coupon = result.coupon!;
      const plan = await storage.getPlan(planId);
      
      let discountAmount = 0;
      if (plan) {
        if (coupon.discountType === "percentage") {
          discountAmount = Math.round(plan.price * (coupon.discountValue / 100));
        } else {
          discountAmount = Math.min(coupon.discountValue, plan.price);
        }
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          discountDurationMonths: coupon.discountDurationMonths,
        },
        discountAmount,
        finalPrice: plan ? plan.price - discountAmount : 0,
      });
    } catch (error) {
      console.error("Error validating coupon:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user's affiliate stats (if they have a coupon)
  app.get("/api/user/affiliate-stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const stats = await storage.getAffiliateStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching affiliate stats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get commissions for current user (as affiliate)
  app.get("/api/user/commissions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const commissions = await storage.getCommissionsByAffiliateId(userId);
      res.json(commissions);
    } catch (error) {
      console.error("Error fetching user commissions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get enriched commission history for affiliate panel
  app.get("/api/affiliate/commissions-detail", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const commissions = await storage.getAffiliateCommissionsDetail(userId);
      res.json(commissions);
    } catch (error) {
      console.error("Error fetching affiliate commissions detail:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
