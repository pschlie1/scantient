# The Security Checklist for Apps Built with Cursor, Lovable, and Replit

AI coding tools ship apps fast. Security reviews do not keep up. This checklist closes the gap.

Run through it before any AI-generated app goes to production, or use automated monitoring to check continuously.

---

## Security Headers (15 minutes to fix)

Every web app should return these HTTP response headers. Most AI-generated apps do not.

**Content-Security-Policy**
Tells browsers which sources are allowed to load scripts, styles, and media. Missing CSP is one of the most common findings in AI-generated apps.

Check: Open DevTools → Network → click your page → look for `Content-Security-Policy` in response headers.

Fix: Add to your server or CDN configuration. Start with `Content-Security-Policy: default-src 'self'` and expand as needed.

**HTTP Strict-Transport-Security**
Forces browsers to use HTTPS for all future requests. Without it, users on public Wi-Fi are vulnerable to downgrade attacks.

Fix: `Strict-Transport-Security: max-age=31536000; includeSubDomains`

**X-Frame-Options**
Prevents your app from being embedded in iframes on other sites (clickjacking).

Fix: `X-Frame-Options: DENY`

**X-Content-Type-Options**
Stops browsers from guessing content types, which prevents certain injection attacks.

Fix: `X-Content-Type-Options: nosniff`

**Referrer-Policy**
Controls what URL information browsers send when users navigate away from your app.

Fix: `Referrer-Policy: strict-origin-when-cross-origin`

---

## Secrets and API Keys (check before every deploy)

AI coding tools frequently generate code that includes API keys, database credentials, or service tokens in client-side JavaScript. This is the fastest way to get compromised.

**Check your bundled JavaScript**
Open your deployed app. View source or open DevTools → Sources. Search for strings like `sk_`, `pk_`, `AIza`, `eyJ`, `Bearer`, `token`, `secret`, `password`, `api_key`.

If you find any, they are exposed to every visitor.

**Check your environment variable handling**
In Next.js, only variables prefixed with `NEXT_PUBLIC_` are sent to the browser. Everything else stays server-side. AI tools sometimes prefix variables that should remain private.

**Use secret scanning in CI**
Add `gitleaks` or `trufflehog` to your GitHub Actions pipeline. They scan every commit for accidentally committed secrets.

---

## Authentication and Session Security

**Cookie flags**
If your app sets cookies, check that every cookie has:
- `Secure` — only sent over HTTPS
- `HttpOnly` — not accessible via JavaScript
- `SameSite=Lax` or `SameSite=Strict` — prevents CSRF

AI-generated auth code frequently omits these flags.

**Client-side auth bypass**
Check whether your app makes authorization decisions in JavaScript that a user could bypass by editing code in DevTools. Auth checks should happen on the server, not the client.

**CORS configuration**
Check your API routes. If you see `Access-Control-Allow-Origin: *` on endpoints that handle user data, that is a problem. Restrict to specific origins.

---

## SSL and HTTPS

**Certificate validity**
Check your SSL certificate expiry date. Most monitoring tools alert 30 days before expiry. AI-generated apps often get deployed once and forgotten — certificates expire without anyone noticing.

**Mixed content**
If your page loads any resources (images, scripts, fonts) over HTTP while the page itself is HTTPS, browsers will block them. Search your HTML for `http://` in src attributes.

---

## Third-Party Scripts

AI tools pull in libraries from CDNs without version pinning. This creates supply chain risk.

**Check what you are loading**
Open DevTools → Network → filter by Script. Note every external domain loading JavaScript into your app. Ask whether each one is necessary and whether it is from a trusted source.

**Version pin CDN scripts**
Replace `<script src="https://cdn.example.com/library.js">` with a specific version: `library@2.1.3.min.js`. This prevents a compromised CDN from pushing malicious code to your users.

**Subresource Integrity**
For critical third-party scripts, add integrity hashes. GitHub Copilot and similar tools do not generate these. Add them manually.

---

## Information Disclosure

**Server header**
Your web server should not broadcast what software it runs. Check whether your response headers include `Server: nginx/1.18.0` or `X-Powered-By: Express`. Remove or obscure these.

**Error messages**
Verify that error pages do not expose stack traces, file paths, or database schema details. Test by sending a malformed request or navigating to a nonexistent route.

---

## Availability Basics

**Uptime monitoring**
Set up an external monitor that checks your app every few minutes and alerts if it goes down. Vercel, Render, and Railway do not send alerts for application-level errors, only infrastructure failures.

**Response time baseline**
Record your app's average response time. Set an alert if it degrades significantly. Performance regression is often the first sign of a problem.

---

## Ongoing Monitoring

Running this checklist once before launch is not enough. Apps change. Dependencies get updated. Certificates expire. New vulnerabilities get discovered.

Set up automated scanning that runs on a schedule and alerts your team when anything falls below baseline. The scan should be external — it should check your app the same way a user or attacker would, without requiring access to your codebase or infrastructure.

---

*Scantient runs all of these checks automatically against every app in your portfolio. No SDK required — just a URL.*
