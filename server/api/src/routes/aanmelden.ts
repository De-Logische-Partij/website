import { Hono } from "hono";
import db from "../db";

const rateLimit = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => t > hourAgo);
  rateLimit.set(ip, timestamps);
  return timestamps.length >= 5;
}

function recordRequest(ip: string): void {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const timestamps = (rateLimit.get(ip) ?? []).filter((t) => t > hourAgo);
  timestamps.push(now);
  rateLimit.set(ip, timestamps);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const aanmelden = new Hono();

aanmelden.post("/", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

  if (isRateLimited(ip)) {
    return c.json({ success: false, message: "Te veel aanmeldingen. Probeer het later opnieuw." }, 429);
  }

  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, message: "Ongeldig verzoek." }, 400);
  }

  const email = body.email?.trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ success: false, message: "Vul een geldig e-mailadres in." }, 400);
  }

  recordRequest(ip);

  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(email);
  const emailHash = hasher.digest("hex");

  try {
    db.prepare("INSERT INTO subscribers (email_hash) VALUES (?)").run(emailHash);
  } catch (e: any) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return c.json({ success: true, message: "Bedankt voor je aanmelding!" });
    }
    throw e;
  }

  return c.json({ success: true, message: "Bedankt voor je aanmelding!" });
});

export default aanmelden;
