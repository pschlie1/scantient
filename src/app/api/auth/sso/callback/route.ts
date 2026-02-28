import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { createSession } from "@/lib/auth";
import * as client from "openid-client";

const JWT_SECRET = process.env.JWT_SECRET ?? "fallback-secret";
const STATE_COOKIE = "vs_sso_state";

interface StatePayload { codeVerifier: string; state: string; orgId: string; domain: string; }

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  try {
    const cookieStore = await cookies();
    const stateToken = cookieStore.get(STATE_COOKIE)?.value;
    if (!stateToken) return NextResponse.redirect(new URL("/login?error=sso_failed", requestUrl.origin));

    let statePayload: StatePayload;
    try {
      statePayload = jwt.verify(stateToken, JWT_SECRET) as StatePayload;
    } catch {
      cookieStore.delete(STATE_COOKIE);
      return NextResponse.redirect(new URL("/login?error=sso_failed", requestUrl.origin));
    }

    const { codeVerifier, state: expectedState, orgId } = statePayload;
    const ssoConfig = await db.sSOConfig.findFirst({ where: { orgId, enabled: true } });
    if (!ssoConfig?.discoveryUrl || !ssoConfig.clientId) {
      cookieStore.delete(STATE_COOKIE);
      return NextResponse.redirect(new URL("/login?error=sso_failed", requestUrl.origin));
    }

    const { deobfuscate } = await import("@/lib/crypto-util");
    const clientSecret = ssoConfig.clientSecret ? deobfuscate(ssoConfig.clientSecret) : undefined;
    const oidcConfig = await client.discovery(new URL(ssoConfig.discoveryUrl), ssoConfig.clientId, clientSecret);
    const tokens = await client.authorizationCodeGrant(oidcConfig, requestUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });

    const claims = tokens.claims();
    const email = (claims?.email ?? "") as string;
    const name = (claims?.name ?? claims?.given_name ?? email) as string;
    if (!email) {
      cookieStore.delete(STATE_COOKIE);
      return NextResponse.redirect(new URL("/login?error=sso_failed", requestUrl.origin));
    }

    let user = await db.user.findFirst({ where: { email: email.toLowerCase(), orgId } });
    if (!user) {
      user = await db.user.create({ data: { email: email.toLowerCase(), name, orgId, role: "MEMBER", emailVerified: true } });
    }
    await createSession(user.id);
    cookieStore.delete(STATE_COOKIE);
    return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
  } catch (err) {
    console.error("SSO callback error:", err);
    const cookieStore = await cookies();
    cookieStore.delete(STATE_COOKIE);
    return NextResponse.redirect(new URL("/login?error=sso_failed", requestUrl.origin));
  }
}
