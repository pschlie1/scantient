/**
 * Shared types for Tier 3 infrastructure connectors.
 *
 * Each connector lives in src/lib/connectors/<name>.ts and exports:
 *  - run(credentials): Promise<ConnectorResult>
 *
 * Connector credentials are stored per-org in ConnectorCredential (encrypted JSON).
 * ConnectorResult is stored in MonitorRun.connectorResults as Record<connector, ConnectorResult>.
 */

import type { SecurityFinding } from "@/lib/types";

export type { SecurityFinding };

/**
 * The result returned by any connector's run() function.
 * Findings are surfaced alongside security findings in the scan results.
 */
export interface ConnectorResult {
  ok: boolean;
  findings: SecurityFinding[];
  data: Record<string, unknown>; // raw data for display in the dashboard
  checkedAt: string; // ISO timestamp
}
