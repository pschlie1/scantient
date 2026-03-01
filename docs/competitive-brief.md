# Scantient Competitive Brief

*Last updated: 2026-03-01*

## Market Category

Scantient sits between two existing categories:
- **DAST / Vulnerability Scanners** (Detectify, Probely, Intruder, Acunetix) — deep authenticated scanning, SQL injection, XSS detection
- **EASM / Attack Surface Management** (Attaxion, Detectify Surface, CyCognito) — discover and map external assets

Scantient's category: **AI App Portfolio Governance** — continuous external monitoring of apps built by non-security engineers using AI tools. This category does not have an established name yet. That is an advantage.

---

## Competitor Pricing (2026)

| Tool | Entry Price | Per App? | AI App Angle |
|------|-------------|----------|--------------|
| Detectify | €88/mo | Yes (per scan profile) | No |
| Probely | ~$100/mo | Yes (per target) | No |
| Intruder | $173/mo | Yes (per target) | No |
| Acunetix | ~$5,000/yr | Yes | No |
| Attaxion | Custom | No (asset-based) | No |
| **Scantient Starter** | **$199/mo** | **No (5 apps)** | **Yes** |
| **Scantient Pro** | **$399/mo** | **No (15 apps)** | **Yes** |
| **Scantient Enterprise** | **$1,500/mo** | **No (100 apps)** | **Yes** |

**Price advantage is significant for portfolios.** A company with 15 apps would pay ~€1,320/mo on Detectify vs. $399/mo on Scantient Pro. This is a 3x cost advantage that IT buyers will notice.

---

## What Competitors Do That We Do Not

| Feature | Detectify | Intruder | Scantient |
|---------|-----------|----------|-----------|
| Authenticated crawling | ✅ | ✅ | ❌ (auth headers only) |
| SQL injection detection | ✅ | ✅ | ❌ |
| XSS detection | ✅ | ✅ | ❌ |
| CVE database matching | ✅ | ✅ | ❌ |
| JavaScript execution | ✅ | Partial | ❌ |

**This is our known gap.** We scan what is visible without executing JavaScript. We detect configuration-level issues, not code-level vulnerabilities. For many AI-generated apps, configuration issues are the most common and impactful class of vulnerability — but we should not position against traditional scanners, we should position alongside them.

---

## What We Do That Competitors Do Not

| Feature | Detectify | Intruder | Scantient |
|---------|-----------|----------|-----------|
| AI-generated app focus | ❌ | ❌ | ✅ |
| Portfolio governance view | ❌ | ❌ | ✅ |
| IT leader dashboard (not security team) | ❌ | ❌ | ✅ |
| Compliance score (SOC2/NIST/ISO27001) | Partial | ❌ | ✅ |
| Internal app scan agent (VPN/intranet) | ❌ | ❌ | ✅ |
| Per-app auth headers | ❌ | ❌ | ✅ |
| SOC2 evidence packs (1-click) | ❌ | ❌ | ✅ |
| Free public security score (no signup) | ❌ | ❌ | ✅ |
| MCP integration | ❌ | ❌ | ✅ |
| PagerDuty + Teams + Slack alerts | Partial | Partial | ✅ |

---

## Positioning Statement

**For competitors (if asked directly):**
"Detectify and Intruder are excellent for security teams running deep authenticated scans on applications they own and maintain. Scantient is for IT leaders who need governance visibility across dozens of apps built by developers using AI tools — most of which have never been through a security review."

**Complementary angle (not competing):**
Scantient catches what traditional scanners miss about configuration and governance. Traditional scanners catch what Scantient misses about code-level vulnerabilities. Many enterprises will run both.

---

## Win Conditions

We win when the buyer is:
- An IT Director or CISO (not a security engineer) — they want governance, not findings
- Managing 5-50 apps built by developers without security training
- Going through SOC2 or facing an insurance questionnaire
- At a company that has adopted Cursor, Lovable, or similar AI dev tools
- At an MSP managing apps for multiple client organizations

We lose when the buyer wants:
- Deep penetration testing (authenticated, JavaScript-executing crawl)
- CVE-based vulnerability management
- A tool their security engineer will run (not their IT director)

---

## Next Competitive Moves

1. **MSP/Agency tier** — Detectify has no multi-tenant MSP offering. This is an uncontested segment.
2. **App discovery** — automatically finding AI-generated apps in an organization before the IT leader even knows they exist. No competitor does this for vibe-coded apps.
3. **Free tier as competitive wedge** — public `/score` URL gives instant value with no signup. Detectify requires a paid trial to scan.
