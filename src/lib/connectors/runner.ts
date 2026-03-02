/**
 * Tier 3 Connector Runner
 *
 * Loads configured connector credentials for an org, runs each connector,
 * and returns combined findings + raw data for storage in MonitorRun.connectorResults.
 *
 * Usage in scanner:
 *   const { allFindings, connectorResults } = await runConnectors(app.orgId);
 *   // Store connectorResults in MonitorRun.connectorResults
 *   // Merge allFindings into the main findings list
 */

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto-util";
import type { ConnectorResult, SecurityFinding } from "./types";

const CONNECTOR_NAMES = ["vercel", "github", "stripe"] as const;
type ConnectorName = (typeof CONNECTOR_NAMES)[number];

/**
 * Dynamically import a connector by name to avoid loading all connectors on every request.
 */
async function loadConnector(
  name: ConnectorName,
): Promise<{ run: (credentials: Record<string, string>) => Promise<ConnectorResult> }> {
  switch (name) {
    case "vercel":
      return import("./vercel");
    case "github":
      return import("./github");
    case "stripe":
      return import("./stripe");
  }
}

/**
 * Run all configured connectors for an org.
 * Returns findings (tagged with connector as source) and raw connector data.
 *
 * Never throws — connector failures are non-fatal.
 */
export async function runConnectors(orgId: string): Promise<{
  allFindings: SecurityFinding[];
  connectorResults: Record<string, ConnectorResult>;
}> {
  // Load all connector credentials for this org in one query
  const credentials = await db.connectorCredential.findMany({
    where: { orgId },
    select: { connector: true, encrypted: true },
  });

  if (credentials.length === 0) {
    return { allFindings: [], connectorResults: {} };
  }

  const allFindings: SecurityFinding[] = [];
  const connectorResults: Record<string, ConnectorResult> = {};

  // Run all configured connectors in parallel
  await Promise.all(
    credentials.map(async (cred) => {
      const connectorName = cred.connector as ConnectorName;
      if (!CONNECTOR_NAMES.includes(connectorName)) return;

      try {
        const decrypted = decrypt(cred.encrypted);
        const parsed = JSON.parse(decrypted) as Record<string, string>;

        const connector = await loadConnector(connectorName);
        const result = await connector.run(parsed);

        connectorResults[connectorName] = result;

        // Tag findings with the connector name as source code prefix
        for (const finding of result.findings) {
          allFindings.push({
            ...finding,
            // Prefix the code so findings from connectors are distinguishable
            // from HTTP scanner findings (codes are already prefixed e.g. VERCEL_*)
            code: finding.code,
            title: `[${connectorName.toUpperCase()}] ${finding.title}`,
          });
        }
      } catch (err) {
        console.warn(
          `[connector:${connectorName}] Connector run failed (non-fatal):`,
          err instanceof Error ? err.message : err,
        );
        // Record the failure in connector results so it shows in the dashboard
        connectorResults[connectorName] = {
          ok: false,
          findings: [],
          data: {
            error: err instanceof Error ? err.message : "Connector run failed",
          },
          checkedAt: new Date().toISOString(),
        };
      }
    }),
  );

  return { allFindings, connectorResults };
}
