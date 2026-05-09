import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { sendWelcomeEmail } from "./email";
import { toSafeUser } from "./lib/safeUser";

function getSessionDatabaseUrl(): string {
  if (process.env.EXTERNAL_DATABASE_URL) return process.env.EXTERNAL_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER) {
    return `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD || ""}@${process.env.PGHOST}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE}`;
  }
  throw new Error("No database URL available for session store.");
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: getSessionDatabaseUrl(),
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    impersonationToken?: string;
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email: rawEmail, password, firstName, lastName } = req.body;

      if (!rawEmail || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      const email = rawEmail.trim().toLowerCase();

      if (password.length < 6) {
        return res.status(400).json({ message: "Senha deve ter pelo menos 6 caracteres" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      if (email) {
        const name = firstName || email.split("@")[0] || "";
        sendWelcomeEmail(email, name, user.id).catch(err => {
          console.error("[Auth] Failed to send welcome email:", err);
        });
      }

      req.session.userId = user.id;

      res.json(toSafeUser(user));
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email: rawEmail, password } = req.body;

      if (!rawEmail || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      const email = rawEmail.trim().toLowerCase();

      const user = await storage.getUserByEmail(email);

      if (!user || !user.password) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      if (user.suspendedAt) {
        return res.status(403).json({ message: "Conta suspensa. Entre em contato com o suporte." });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      req.session.userId = user.id;
      delete req.session.impersonationToken;

      req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ message: "Erro ao criar sessão" });
        }
        res.json(toSafeUser(user));
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
      }
      res.redirect("/");
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Erro ao fazer logout" });
      }
      res.json({ success: true });
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const impersonationToken = req.session.impersonationToken;

  if (impersonationToken) {
    try {
      const impersonation = await storage.getAdminImpersonation(impersonationToken);
      if (impersonation) {
        const targetUser = await storage.getUser(impersonation.targetUserId);
        if (targetUser) {
          (req as any).user = {
            id: impersonation.targetUserId,
            originalAdminId: impersonation.adminId,
            isImpersonating: true,
          };
          return next();
        }
      }
    } catch (e) {
      console.error("[Auth] Impersonation token validation error:", e);
    }
    delete req.session.impersonationToken;
  }

  const user = await storage.getUser(userId);
  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  (req as any).user = { id: userId };
  return next();
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  // Delegates to the centralized permission system.
  // Import inline to avoid circular dependency with storage.
  const { requireAdmin } = await import("./auth/permissions");
  return requireAdmin(req, res, next);
};
