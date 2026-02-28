import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

// MCP JSON-RPC compatible endpoint
// Spec: https://modelcontextprotocol.io

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function err(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

const TOOLS = [
  { name: "list_apps", description: "List all monitored applications", inputSchema: { type: "object", properties: {} } },
  { name: "get_app_status", description: "Get status of a specific app", inputSchema: { type: "object", properties: { app_id: { type: "string" } }, required: ["app_id"] } },
  { name: "get_findings", description: "Get security findings, optionally filtered by severity", inputSchema: { type: "object", properties: { severity: { type: "string", enum: ["critical", "high", "medium", "low"] } } } },
  { name: "trigger_scan", description: "Trigger a security scan for an app", inputSchema: { type: "object", properties: { app_id: { type: "string" } }, required: ["app_id"] } },
  { name: "get_security_score", description: "Get overall security score for the organization", inputSchema: { type: "object", properties: {} } },
];

// Placeholder tool execution — returns mock data
function executeTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_apps":
      return { apps: [{ id: "app_1", name: "Production API", status: "healthy", url: "https://api.example.com" }] };
    case "get_app_status":
      return { app_id: args.app_id, status: "healthy", uptime: "99.97%", lastChecked: new Date().toISOString() };
    case "get_findings":
      return { findings: [{ id: "f_1", title: "Outdated dependency", severity: args.severity || "medium", status: "open" }] };
    case "trigger_scan":
      return { scan_id: "scan_" + Date.now(), app_id: args.app_id, status: "queued" };
    case "get_security_score":
      return { score: 87, grade: "B+", trend: "improving" };
    default:
      return null;
  }
}

export async function POST(req: Request) {
  // Require API key authentication
  const orgId = await authenticateApiKey(req);
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized: valid API key required via Authorization header" }, { status: 401 });
  }

  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return err(body.id ?? null, -32600, "Invalid Request");
  }

  const { id, method, params } = body;

  // MCP discovery
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "vibesafe-mcp", version: "1.0.0" },
      capabilities: { tools: {} },
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const toolName = (params as Record<string, unknown>)?.name as string;
    const toolArgs = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;
    const result = executeTool(toolName, toolArgs);
    if (!result) return err(id, -32602, `Unknown tool: ${toolName}`);
    return ok(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
  }

  return err(id, -32601, "Method not found");
}
