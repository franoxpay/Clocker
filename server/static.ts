import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  app.use("*", (req: Request, res: Response, next: NextFunction) => {
    const rawHost = req.get("host") || "";
    const forwardedHost = req.get("x-forwarded-host") || "";
    const host = (forwardedHost || rawHost).split(":")[0].toLowerCase();
    const mainDomain = (process.env.MAIN_DOMAIN || "clocker.franox.com.br").toLowerCase();
    const easypanelHost = ".easypanel.host";
    
    console.log(`[STATIC FALLBACK] Path: ${req.path}, Host: ${host}, RawHost: ${rawHost}, ForwardedHost: ${forwardedHost}, MainDomain: ${mainDomain}`);
    
    const isMainDomain = host === mainDomain || 
                         host.endsWith(easypanelHost) || 
                         host === "localhost" ||
                         host.includes("replit");
    
    console.log(`[STATIC FALLBACK] IsMainDomain: ${isMainDomain}`);
    
    if (isMainDomain) {
      console.log(`[STATIC FALLBACK] Serving index.html for main domain`);
      res.sendFile(path.resolve(distPath, "index.html"));
    } else {
      console.log(`[STATIC FALLBACK] Custom domain not handled by cloaking routes - returning 404`);
      res.status(404).json({ 
        error: "Offer not found", 
        message: "The requested offer does not exist or the domain is not configured correctly.",
        host: host,
        path: req.path
      });
    }
  });
}
