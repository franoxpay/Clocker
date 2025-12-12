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
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(":")[0].toLowerCase();
    const mainDomain = (process.env.MAIN_DOMAIN || "clocker.franox.com.br").toLowerCase();
    const easypanelHost = ".easypanel.host";
    
    const isMainDomain = host === mainDomain || 
                         host.endsWith(easypanelHost) || 
                         host === "localhost" ||
                         host.includes("replit");
    
    if (isMainDomain) {
      res.sendFile(path.resolve(distPath, "index.html"));
    } else {
      res.status(404).json({ 
        error: "Offer not found", 
        message: "The requested offer does not exist or the domain is not configured correctly.",
        host: host
      });
    }
  });
}
