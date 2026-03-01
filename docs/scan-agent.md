# Scantient Scan Agent

The **Scan Agent** is a lightweight, standalone Node.js script that runs **inside your corporate network or behind a VPN**. It fetches internal URLs that Scantient's cloud scanner cannot reach, runs security checks, and pushes the results back to your Scantient dashboard.

Use it to:
- Scan intranet apps and internal services
- Monitor apps behind corporate firewalls or VPN
- Scan apps that require authentication headers (even those the cloud scanner can't reach)

---

## Prerequisites

- **Node.js 18+** (the script uses the built-in `fetch` API, available since Node.js 18)
- A Scantient account with an app configured
- An **Agent Key** generated in your Scantient dashboard (Settings → Apps → [App] → Scan Agent)

---

## Installation

Download the script directly:

```bash
curl -O https://scantient.com/scripts/scan-agent.mjs
```

Or clone it from the repository:

```bash
curl -o scan-agent.mjs https://raw.githubusercontent.com/pschlie1/scantient/main/scripts/scan-agent.mjs
```

No `npm install` needed — the script uses **only Node.js built-ins**.

---

## Configuration

Set these environment variables before running:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCANTIENT_AGENT_KEY` | ✅ Yes | — | Agent key from your dashboard (`sa_...`) |
| `SCANTIENT_APP_URL` | ✅ Yes | — | Internal URL to scan (e.g. `https://internal.corp.example`) |
| `SCANTIENT_API_URL` | No | `https://scantient.com` | Scantient API base URL (change for self-hosted) |

---

## Running

```bash
SCANTIENT_AGENT_KEY=sa_yourKeyHere \
SCANTIENT_APP_URL=https://internal.corp.example \
node scan-agent.mjs
```

Expected output:

```
[scantient-agent] Starting scan of https://internal.corp.example
[scantient-agent] Fetched https://internal.corp.example — HTTP 200 in 342ms
[scantient-agent] Found 3 finding(s):
  🟡 [MEDIUM] X-Frame-Options header missing (MISSING_X_FRAME_OPTIONS)
  🔵 [LOW] X-Content-Type-Options header missing (MISSING_X_CONTENT_TYPE_OPTIONS)
  🔵 [LOW] Server header reveals version information (SERVER_VERSION_DISCLOSED)
[scantient-agent] Posting results to https://scantient.com/api/agent/scan
[scantient-agent] ✅ Scan submitted — runId: clx..., status: HEALTHY, findings: 3
```

Exit code `0` = success, `1` = failure.

---

## Cron Scheduling

To scan every 15 minutes, add to your crontab (`crontab -e`):

```cron
*/15 * * * * SCANTIENT_AGENT_KEY=sa_yourKeyHere SCANTIENT_APP_URL=https://internal.corp.example node /opt/scantient/scan-agent.mjs >> /var/log/scantient-agent.log 2>&1
```

Or use a `.env`-based approach with a wrapper script:

```bash
#!/bin/bash
# /opt/scantient/run-scan.sh
export SCANTIENT_AGENT_KEY=sa_yourKeyHere
export SCANTIENT_APP_URL=https://internal.corp.example
node /opt/scantient/scan-agent.mjs
```

```cron
*/15 * * * * /opt/scantient/run-scan.sh >> /var/log/scantient-agent.log 2>&1
```

---

## Docker Usage

Run the agent as a one-off Docker container (no Dockerfile needed):

```bash
docker run --rm \
  -e SCANTIENT_AGENT_KEY=sa_yourKeyHere \
  -e SCANTIENT_APP_URL=https://internal.corp.example \
  --network host \
  node:22-alpine \
  sh -c "wget -qO /tmp/scan-agent.mjs https://scantient.com/scripts/scan-agent.mjs && node /tmp/scan-agent.mjs"
```

Or schedule it with Docker:

```bash
# Run every 15 minutes via watch
watch -n 900 docker run --rm \
  -e SCANTIENT_AGENT_KEY=sa_yourKeyHere \
  -e SCANTIENT_APP_URL=https://internal.corp.example \
  --network host \
  node:22-alpine \
  sh -c "wget -qO /tmp/scan-agent.mjs https://scantient.com/scripts/scan-agent.mjs && node /tmp/scan-agent.mjs"
```

For production, use a cron-compatible Docker scheduler or Kubernetes CronJob instead.

---

## Security Checks Performed

The agent runs these checks inline (no external dependencies):

| Check | Severity |
|-------|----------|
| Missing Content-Security-Policy | HIGH |
| Missing X-Frame-Options | MEDIUM |
| Missing/weak HSTS | MEDIUM |
| Missing X-Content-Type-Options | LOW |
| Missing Referrer-Policy | LOW |
| Missing Permissions-Policy | LOW |
| Cookie missing HttpOnly / Secure / SameSite | MEDIUM / LOW |
| CORS wildcard (`*`) | HIGH |
| CORS wildcard + credentials | CRITICAL |
| Server header with version number | LOW |
| X-Powered-By disclosed | LOW |
| HTTP (not HTTPS) | CRITICAL |
| Inline scripts (CSP bypass risk) | LOW |
| HTTP 5xx server errors | CRITICAL |
| HTTP 4xx errors | MEDIUM |
| Slow response (>5s) | MEDIUM |
| POST forms without CSRF token | HIGH |

---

## Troubleshooting

### `SCANTIENT_AGENT_KEY is missing or invalid`
Ensure the key starts with `sa_` and was generated in the Scantient dashboard for the correct app.

### `Failed to fetch <URL>`
- Verify the URL is reachable from the machine running the agent
- Check firewall rules and VPN connectivity
- Test manually: `curl -I https://internal.corp.example`

### `API returned 401`
The agent key may have been revoked. Regenerate it in Settings → Apps → [App] → Scan Agent.

### `API returned 400`
The body sent to Scantient was invalid. Update to the latest version of `scan-agent.mjs`.

### Timeout errors
The default fetch timeout is 30 seconds. If the internal app is slow, check performance on the server.

---

## Data Privacy

The scan agent **only sends security findings** (header names, detected issues) to Scantient. It does **not** send the full HTML body or any page content. Your internal page content stays within your network.
