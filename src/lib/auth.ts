import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  // Allow Next.js build to import route modules without runtime secrets.
  if (!secret && isBuildPhase) return "build-phase-placeholder-secret";
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}
const SESSION_COOKIE = "scantient-session";
const SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds
/** Exported for tests only — frequency at which sessions are re-validated against the DB. */
export const REFRESH_THRESHOLD = 5 * 60; // 5 minutes in seconds

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  orgId: string;
  orgName: string;
  orgSlug: string;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function signToken(payload: SessionUser): string {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: SESSION_DURATION,
    issuer: "scantient",
    audience: "scantient-app",

  });
}

function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: "scantient",
      audience: "scantient-app",

    }) as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<SessionUser> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { org: true },
  });

  if (!user) throw new Error("User not found");

  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    orgId: user.orgId,
    orgName: user.org.name,
    orgSlug: user.org.slug,
  };

  const token = signToken(session);
  const cookieStore = await cookies();
  const isSecure = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    maxAge: SESSION_DURATION,
    path: "/",
  });

  await db.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return session;
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = verifyToken(token);
  if (!session) return null;

  // Refresh if token is older than 12 hours
  const decoded = jwt.decode(token) as { iat?: number } | null;
  if (decoded?.iat) {
    const age = Math.floor(Date.now() / 1000) - decoded.iat;
    if (age > REFRESH_THRESHOLD) {
      // Re-fetch user from DB and issue new token
      const user = await db.user.findUnique({
        where: { id: session.id },
        include: { org: true },
      });
      if (!user) return null;
      const refreshed: SessionUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as UserRole,
        orgId: user.orgId,
        orgName: user.org.name,
        orgSlug: user.org.slug,
      };
      const newToken = signToken(refreshed);
      const isSecureRefresh =
        process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
      cookieStore.set(SESSION_COOKIE, newToken, {
        httpOnly: true,
        secure: isSecureRefresh,
        sameSite: "strict",
        maxAge: SESSION_DURATION,
        path: "/",
      });
      return refreshed;
    }
  }

  return session;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireRole(roles: UserRole[]): Promise<SessionUser> {
  const session = await requireSession();
  if (!roles.includes(session.role)) throw new Error("Forbidden");
  return session;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
