/**
 * server/auth/permissions.ts
 *
 * Centralized admin permission system.
 *
 * Source-of-truth hierarchy:
 *   1. users.isAdmin = true  →  super-admin, all permissions  (source: "database")
 *   2. admin_permissions rows →  granular grants for partial admins (source: "database")
 *   3. ADMIN_EMAIL env var   →  emergency fallback only, emits WARNING (source: "admin_email_fallback")
 *
 * Usage:
 *   import { requireAdmin, requirePermission, getUserPermissions, checkIsAdmin } from "../auth/permissions";
 *
 *   app.get("/api/admin/...", requireAdmin, handler);
 *   app.get("/api/internal/health", requirePermission("admin:monitoring"), handler);
 */

import type { RequestHandler } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { adminPermissions } from "@shared/schema";
import { eq } from "drizzle-orm";

// ─── Permission keys ────────────────────────────────────────────────────────

export const ALL_PERMISSION_KEYS = [
  "admin:users",
  "admin:billing",
  "admin:domains",
  "admin:emails",
  "admin:monitoring",
  "admin:settings",
  "admin:click_logs",
  "admin:impersonate",
] as const;

export type AdminPermissionKey = typeof ALL_PERMISSION_KEYS[number];

// ─── Core check ─────────────────────────────────────────────────────────────

export interface AdminCheckResult {
  granted: boolean;
  source: "database" | "admin_email_fallback" | "none";
  userIsAdminFromDb: boolean;
  adminEmailConfigured: boolean;
  adminEmailMatch: boolean;
  user: { id: string; email: string | null; isAdmin: boolean } | null;
}

export async function checkIsAdmin(userId: string): Promise<AdminCheckResult> {
  const user = await storage.getUser(userId);

  const adminEmailEnv = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminEmailConfigured = !!adminEmailEnv;

  if (!user) {
    return {
      granted: false,
      source: "none",
      userIsAdminFromDb: false,
      adminEmailConfigured,
      adminEmailMatch: false,
      user: null,
    };
  }

  const userIsAdminFromDb = user.isAdmin === true;
  const adminEmailMatch = !!(adminEmailEnv && user.email?.toLowerCase() === adminEmailEnv);

  // Primary: database flag
  if (userIsAdminFromDb) {
    return {
      granted: true,
      source: "database",
      userIsAdminFromDb,
      adminEmailConfigured,
      adminEmailMatch,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
    };
  }

  // Fallback: ADMIN_EMAIL env var (emergency only — emits WARNING)
  if (adminEmailMatch) {
    console.warn(JSON.stringify({
      event: "ADMIN_EMAIL_FALLBACK_USED",
      level: "WARNING",
      message: "Admin access granted via ADMIN_EMAIL env var because users.isAdmin=false in DB. Run: UPDATE users SET is_admin=true WHERE email='...'",
      userId,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
    }));
    return {
      granted: true,
      source: "admin_email_fallback",
      userIsAdminFromDb,
      adminEmailConfigured,
      adminEmailMatch,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
    };
  }

  return {
    granted: false,
    source: "none",
    userIsAdminFromDb,
    adminEmailConfigured,
    adminEmailMatch,
    user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
  };
}

// ─── Permission resolution ───────────────────────────────────────────────────

export interface PermissionResult {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  permissions: AdminPermissionKey[];
  source: "database" | "admin_email_fallback" | "none";
}

export async function getUserPermissions(userId: string): Promise<PermissionResult> {
  const check = await checkIsAdmin(userId);

  // Super-admin (by DB flag or email fallback): all permissions
  if (check.granted) {
    return {
      userId,
      email: check.user?.email ?? null,
      isAdmin: true,
      permissions: [...ALL_PERMISSION_KEYS],
      source: check.source,
    };
  }

  // Not a super-admin: check explicit grants in admin_permissions table
  try {
    const grants = await db
      .select()
      .from(adminPermissions)
      .where(eq(adminPermissions.userId, userId));

    const permissions = grants
      .map((g) => g.permission as AdminPermissionKey)
      .filter((p) => (ALL_PERMISSION_KEYS as readonly string[]).includes(p));

    return {
      userId,
      email: check.user?.email ?? null,
      isAdmin: false,
      permissions,
      source: "none",
    };
  } catch (err: any) {
    console.error("[Permissions] Failed to load admin_permissions grants:", err.message);
    return {
      userId,
      email: check.user?.email ?? null,
      isAdmin: false,
      permissions: [],
      source: "none",
    };
  }
}

// ─── Middlewares ─────────────────────────────────────────────────────────────

/**
 * requireAdmin — allows any super-admin (isAdmin=true in DB or ADMIN_EMAIL fallback).
 * Drop-in replacement for the old `isAdmin` middleware from replitAuth.ts.
 */
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = (req as any).session?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const check = await checkIsAdmin(userId);
    if (!check.granted) {
      return res.status(403).json({ message: "Forbidden" });
    }
    (req as any).user = { id: userId };
    return next();
  } catch (err: any) {
    console.error("[Permissions] requireAdmin error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * requirePermission(key) — allows super-admins OR users with an explicit grant.
 */
export function requirePermission(permission: AdminPermissionKey): RequestHandler {
  return async (req, res, next) => {
    const userId = (req as any).session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const perms = await getUserPermissions(userId);
      if (!perms.permissions.includes(permission)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      (req as any).user = { id: userId };
      return next();
    } catch (err: any) {
      console.error(`[Permissions] requirePermission(${permission}) error:`, err.message);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}
