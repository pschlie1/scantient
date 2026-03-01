import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP API Documentation — Scantient",
  description: "Connect AI agents to Scantient via the Model Context Protocol (MCP) endpoint.",
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
      <code>{children}</code>
    </pre>
  );
}

function ToolCard({
  name,
  description,
  params,
  example,
  response,
}: {
  name: string;
  description: string;
  params: { name: string; type: string; required: boolean; description: string }[];
  example: object;
  response: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-2 font-mono text-lg font-bold text-blue-600 dark:text-blue-400">{name}</h3>
      <p className="mb-4 text-gray-600 dark:text-gray-300">{description}</p>

      {params.length > 0 && (
        <>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Parameters</h4>
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Required</th>
                <th className="pb-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.name} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 pr-4 font-mono text-sm">{p.name}</td>
                  <td className="py-2 pr-4 text-gray-500">{p.type}</td>
                  <td className="py-2 pr-4">{p.required ? "✅" : "—"}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Example Request</h4>
      <CodeBlock>{JSON.stringify(example, null, 2)}</CodeBlock>

      <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Response</h4>
      <CodeBlock>{response}</CodeBlock>
    </div>
  );
}

const tools = [
  {
    name: "list_apps",
    description: "List all monitored applications for your organization.",
    params: [],
    example: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list_apps", arguments: {} },
    },
    response: `{ "apps": [{ "id": "clx...", "name": "Production API", "url": "https://api.example.com", "status": "HEALTHY", "lastCheckedAt": "2026-02-28T..." }] }`,
  },
  {
    name: "get_app_status",
    description: "Get detailed status of a specific app including latest scan results, finding counts by severity, and computed security score.",
    params: [{ name: "appId", type: "string", required: true, description: "The application ID" }],
    example: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_app_status", arguments: { appId: "clx..." } },
    },
    response: `{ "app": { "id": "clx...", "name": "My App", "url": "...", "status": "WARNING" },
  "latestRun": { "id": "...", "status": "WARNING", "responseTimeMs": 342, ... },
  "findingCounts": { "CRITICAL": 0, "HIGH": 2, "MEDIUM": 1, "LOW": 3 },
  "securityScore": 74, "grade": "C" }`,
  },
  {
    name: "get_findings",
    description: "Get security findings for an app with optional filters.",
    params: [
      { name: "appId", type: "string", required: true, description: "The application ID" },
      { name: "status", type: "string", required: false, description: "OPEN | ACKNOWLEDGED | IN_PROGRESS | RESOLVED | IGNORED" },
      { name: "severity", type: "string", required: false, description: "LOW | MEDIUM | HIGH | CRITICAL" },
    ],
    example: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_findings", arguments: { appId: "clx...", severity: "HIGH" } },
    },
    response: `{ "findings": [{ "id": "...", "code": "SEC-001", "title": "Missing CSP header", "severity": "HIGH", "description": "...", "status": "OPEN", "createdAt": "..." }], "total": 1 }`,
  },
  {
    name: "trigger_scan",
    description: "Trigger an HTTP security scan for an app. Runs the full scanner and returns results.",
    params: [{ name: "appId", type: "string", required: true, description: "The application ID" }],
    example: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "trigger_scan", arguments: { appId: "clx..." } },
    },
    response: `{ "appId": "clx...", "status": "WARNING", "findingsCount": 5, "responseTimeMs": 1240 }`,
  },
  {
    name: "get_security_score",
    description: "Get security score for a specific app or portfolio-wide average. Score = 100 minus weighted penalties (CRITICAL×25, HIGH×10, MEDIUM×3, LOW×1).",
    params: [{ name: "appId", type: "string", required: false, description: "App ID. Omit for portfolio-wide score." }],
    example: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "get_security_score", arguments: {} },
    },
    response: `{ "score": 82, "grade": "B", "appCount": 3, "apps": [{ "appId": "...", "name": "...", "score": 90 }, ...] }`,
  },
  {
    name: "resolve_finding",
    description: "Update the status of a finding — resolve, acknowledge, or ignore it.",
    params: [
      { name: "findingId", type: "string", required: true, description: "The finding ID" },
      { name: "status", type: "string", required: true, description: "OPEN | ACKNOWLEDGED | IN_PROGRESS | RESOLVED | IGNORED" },
    ],
    example: {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "resolve_finding", arguments: { findingId: "clx...", status: "RESOLVED" } },
    },
    response: `{ "finding": { "id": "clx...", "status": "RESOLVED", "resolvedAt": "2026-02-28T..." } }`,
  },
  {
    name: "get_remediation_metrics",
    description: "Get org-level remediation metrics: finding counts by status, fix rate, MTTR, and MTTA.",
    params: [],
    example: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "get_remediation_metrics", arguments: {} },
    },
    response: `{ "totalFindings": 42, "byStatus": { "OPEN": 12, "RESOLVED": 25, "IGNORED": 5 }, "fixRate": "60%", "mttrHours": 18.3, "mttaHours": 2.1 }`,
  },
];

export default function McpDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="mb-4 text-4xl font-bold">MCP API Reference</h1>
      <p className="mb-8 text-lg text-gray-600 dark:text-gray-300">
        Connect AI agents to Scantient using the{" "}
        <a href="https://modelcontextprotocol.io" className="text-blue-600 underline" target="_blank" rel="noopener">
          Model Context Protocol
        </a>
        . Your agents can list apps, check security scores, trigger scans, and manage findings — all via a single JSON-RPC 2.0 endpoint.
      </p>

      {/* Auth */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Authentication</h2>
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          All requests require an API key sent via the <code className="rounded bg-gray-100 px-1 dark:bg-gray-700">Authorization</code> header:
        </p>
        <CodeBlock>{`curl -X POST https://scantient.com/api/mcp \\
  -H "Authorization: Bearer vs_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</CodeBlock>
        <p className="mt-4 text-sm text-gray-500">
          Generate API keys in <strong>Settings → API Keys</strong>. Keys are scoped to your organization.
        </p>
      </section>

      {/* Protocol */}
      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Protocol</h2>
        <p className="mb-4 text-gray-600 dark:text-gray-300">
          The endpoint speaks <strong>JSON-RPC 2.0</strong> with MCP methods:
        </p>
        <ul className="mb-4 list-inside list-disc space-y-1 text-gray-600 dark:text-gray-300">
          <li><code className="rounded bg-gray-100 px-1 dark:bg-gray-700">initialize</code> — Handshake, returns server info and capabilities</li>
          <li><code className="rounded bg-gray-100 px-1 dark:bg-gray-700">tools/list</code> — List available tools and their schemas</li>
          <li><code className="rounded bg-gray-100 px-1 dark:bg-gray-700">tools/call</code> — Execute a tool with arguments</li>
        </ul>
        <CodeBlock>{`POST /api/mcp
Content-Type: application/json
Authorization: Bearer vs_...

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { ... }
  }
}`}</CodeBlock>
      </section>

      {/* Tools */}
      <section>
        <h2 className="mb-6 text-2xl font-bold">Tools ({tools.length})</h2>
        <div className="space-y-6">
          {tools.map((tool) => (
            <ToolCard key={tool.name} {...tool} />
          ))}
        </div>
      </section>

      {/* Scoring */}
      <section className="mt-12">
        <h2 className="mb-4 text-2xl font-bold">Security Score Formula</h2>
        <p className="mb-2 text-gray-600 dark:text-gray-300">
          Scores are computed from <strong>open findings</strong> (OPEN, ACKNOWLEDGED, IN_PROGRESS):
        </p>
        <CodeBlock>{`score = 100 - (CRITICAL × 25) - (HIGH × 10) - (MEDIUM × 3) - (LOW × 1)
score = max(0, score)

A+ = 95+  |  A = 90+  |  B+ = 85+  |  B = 80+  |  C = 70+  |  D = 60+  |  F = <60`}</CodeBlock>
      </section>
    </div>
  );
}
