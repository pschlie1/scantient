# How to Govern AI-Generated Apps Without Slowing Down Your Team

Your developers are shipping apps in hours using Cursor, Lovable, and Replit. Your job is to make sure those apps don't create a security incident, fail an audit, or expose customer data.

Here is a practical approach that works without slowing anyone down.

---

## The Problem Is Scale, Not Intent

Developers using AI coding tools are not trying to create security risks. They are building fast because the tools let them. The problem is that the tools do not enforce security practices, and most developers are not security experts.

A typical Lovable app ships with:
- No Content-Security-Policy header
- Session cookies without HttpOnly or Secure flags
- Third-party scripts from unvetted sources
- Hard-coded API keys in client-side JavaScript

These are not exotic vulnerabilities. They are the default output of AI-generated code.

---

## What Compliance Auditors Are Starting to Ask

SOC2 auditors increasingly ask about AI-generated software. Specifically:

**CC6.1** (Logical access controls): Does your application enforce access controls? Are session tokens protected?

**CC6.7** (Data transmission): Is data encrypted in transit? Are certificates current?

**A1.1/A1.2** (Availability): Is the application monitored? Do you have evidence of uptime?

If you are going through a SOC2 Type II audit and your developers are shipping AI-generated apps, you need evidence that those apps meet baseline security requirements.

---

## A Three-Step Framework

### 1. Build an inventory

You cannot secure what you cannot see. Start by listing every externally-accessible URL your organization runs. Include internal tools if they are reachable via browser.

For each app, record:
- The URL
- The owner (who built it, who maintains it)
- The criticality (customer-facing vs. internal)
- The tech stack if known

This inventory becomes your evidence of scope for compliance audits.

### 2. Establish a baseline

Define minimum security requirements for every app in your inventory:

- HTTPS with a valid certificate
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- No API keys or secrets in client-side JavaScript
- Cookies with Secure, HttpOnly, and SameSite flags
- A response time under 3 seconds

These requirements are not aspirational. They are table stakes. Any app that fails them is a liability.

### 3. Monitor continuously

Manual audits do not scale. If you have 20 AI-generated apps and a team of 200 developers, you cannot audit each app weekly by hand.

Automated external monitoring checks every app against your baseline on a schedule. When an app fails a check, the right person gets alerted. When the issue is resolved, the evidence is recorded.

This approach does not require installing anything in the monitored apps. It works from the outside, the same way an attacker would approach your systems.

---

## Common Objections

**"Our developers will push back."**

The monitoring is external. Developers do not need to change anything in their code or their process. They receive a finding with a specific fix. Most fixes take under an hour.

**"We do not have budget for another tool."**

One security incident costs more than a year of monitoring. A SOC2 finding related to an ungoverned AI app costs more than that. Frame this as audit readiness, not a security tool.

**"Our internal apps are on a VPN."**

External monitoring covers public apps. For internal apps, a lightweight agent that runs inside your network and reports to your dashboard solves this. No inbound firewall rules required.

---

## What Good Looks Like

At 90 days into this approach, you should have:

- A complete inventory of every app your organization runs
- A baseline security score for each app
- A record of every finding, when it was detected, and when it was resolved
- Automated alerts to the right people when new issues appear
- Evidence you can hand to an auditor as proof of continuous monitoring

This is not a compliance checkbox exercise. It is visibility that lets you move fast without breaking things.

---

*Scantient monitors AI-generated apps with no SDK required. Register a URL and get a security scan in 60 seconds.*
