import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";

export interface Config {
  port: number;
  dataDir: string;
  /** Public address of the app, used in calendar feed and notification links. */
  publicUrl: string;
  jwtSecret: string;
  vapid: { publicKey: string; privateKey: string; subject: string };
  secureCookies: boolean;
  webDist: string | null;
  /** Dev-only demo sign-in route. Never true in production. */
  devDemo: boolean;
}

/** The demo sign-in is allowed only when explicitly asked for, outside production, on a local address. */
export function isDevDemoEnabled(env: NodeJS.ProcessEnv, publicUrl: string): boolean {
  if (env.PLANNER_DEV_DEMO !== "1" || env.NODE_ENV === "production") return false;
  try {
    const host = new URL(publicUrl).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Reads settings from the environment. Secrets that aren't provided are generated once
 * and kept in the data directory, so the app works with zero configuration.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR ?? join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const secretsFile = join(dataDir, "secrets.json");
  const stored: Record<string, string> = existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : {};
  let changed = false;

  if (!env.JWT_SECRET && !stored.jwtSecret) {
    stored.jwtSecret = randomBytes(48).toString("base64url");
    changed = true;
  }
  if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) && !stored.vapidPublicKey) {
    const keys = webpush.generateVAPIDKeys();
    stored.vapidPublicKey = keys.publicKey;
    stored.vapidPrivateKey = keys.privateKey;
    changed = true;
  }
  if (changed) writeFileSync(secretsFile, JSON.stringify(stored, null, 2), { mode: 0o600 });

  const port = Number(env.PORT ?? 3000);
  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, "");
  return {
    port,
    dataDir,
    publicUrl,
    jwtSecret: env.JWT_SECRET ?? stored.jwtSecret,
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY ?? stored.vapidPublicKey,
      privateKey: env.VAPID_PRIVATE_KEY ?? stored.vapidPrivateKey,
      subject: env.VAPID_SUBJECT ?? "mailto:admin@theplanner.local",
    },
    secureCookies: publicUrl.startsWith("https://"),
    webDist: env.WEB_DIST ?? null,
    devDemo: isDevDemoEnabled(env, publicUrl),
  };
}
