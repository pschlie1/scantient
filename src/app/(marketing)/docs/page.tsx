import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = { title: "API Documentation — Scantient" };

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path, desc, curl, response }: { method: string; path: string; desc: string; curl: string; response: string }) {
  const color = method === "GET" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700";
  return (
    <section className="rounded-lg border border-gray-200 p-6">
      <div className="mb-2 flex items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${color}`}>{method}</span>
        <code className="text-sm font-semibold">{path}</code>
      </div>
      <p className="mb-4 text-sm text-gray-600">{desc}</p>
      <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">Example</h4>
      <Code>{curl}</Code>
      <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-gray-400">Response</h4>
      <Code>{response}</Code>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="bg-white">
      <MarketingNav />
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="mb-2 text-3xl font-bold">Scantient API Documentation</h1>
      <p className="mb-10 text-gray-600">Integrate Scantient into your workflow with our REST API.</p>

      {/* Auth */}
      <section className="mb-12">
        <h2 className="mb-4 text-xl font-semibold">Authentication</h2>
        <p className="mb-3 text-sm text-gray-600">
          All API requests require an API key sent in the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">X-API-Key</code> header.
          Keys use the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">vs_</code> prefix and can be managed in{" "}
          <a href="/settings/api-keys" className="text-blue-600 underline">Settings → API Keys</a>.
        </p>
        <Code>{`curl -H "X-API-Key: vs_your_key_here" https://scantient.com/api/v1/apps`}</Code>
      </section>

      {/* Endpoints */}
      <h2 className="mb-6 text-xl font-semibold">Endpoints</h2>
      <div className="space-y-8">
        <Endpoint
          method="GET"
          path="/api/v1/apps"
          desc="List all monitored applications for the authenticated organization."
          curl={`curl -H "X-API-Key: vs_your_key_here" \\
  https://scantient.com/api/v1/apps`}
          response={`{
  "apps": [
    {
      "id": "clx123...",
      "name": "Production API",
      "url": "https://api.example.com",
      "status": "healthy",
      "criticality": "high",
      "lastCheckedAt": "2026-02-28T00:00:00Z",
      "uptimePercent": 99.97,
      "avgResponseMs": 142
    }
  ]
}`}
        />

        <Endpoint
          method="GET"
          path="/api/v1/scan/:id"
          desc="Retrieve the results of a specific security scan by ID."
          curl={`curl -H "X-API-Key: vs_your_key_here" \\
  https://scantient.com/api/v1/scan/scan_abc123`}
          response={`{
  "scan": {
    "id": "scan_abc123",
    "appId": "clx123...",
    "status": "completed",
    "startedAt": "2026-02-28T00:00:00Z",
    "completedAt": "2026-02-28T00:01:30Z",
    "findingsCount": 3,
    "criticalCount": 0,
    "highCount": 1,
    "mediumCount": 2,
    "lowCount": 0
  }
}`}
        />

        <Endpoint
          method="GET"
          path="/api/v1/dashboard"
          desc="Get the organization-wide security dashboard summary."
          curl={`curl -H "X-API-Key: vs_your_key_here" \\
  https://scantient.com/api/v1/dashboard`}
          response={`{
  "securityScore": 87,
  "totalApps": 5,
  "healthyApps": 4,
  "openFindings": 12,
  "criticalFindings": 1,
  "avgUptime": 99.94,
  "lastScanAt": "2026-02-28T00:00:00Z"
}`}
        />
      </div>

      {/* MCP */}
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">MCP (Model Context Protocol)</h2>
        <p className="mb-3 text-sm text-gray-600">
          Scantient exposes an MCP-compatible endpoint at <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">/api/mcp</code> for AI agent integration.
          Send JSON-RPC 2.0 requests to query apps, findings, and trigger scans programmatically.
        </p>
        <Code>{`curl -X POST https://scantient.com/api/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
        <p className="mt-3 text-sm text-gray-600">
          Available tools: <code className="text-xs">list_apps</code>, <code className="text-xs">get_app_status</code>,{" "}
          <code className="text-xs">get_findings</code>, <code className="text-xs">trigger_scan</code>,{" "}
          <code className="text-xs">get_security_score</code>.
        </p>
      </section>

      {/* CI Integration */}
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">CI / CD Integration</h2>
        <p className="mb-3 text-sm text-gray-600">
          Run automated security scans on every push or pull request. Scantient&apos;s CI endpoint
          returns structured JSON and uses HTTP 422 when the scan fails.
        </p>
        <a href="/docs/github-actions" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium hover:bg-gray-50">
          GitHub Actions Integration Guide →
        </a>
      </section>

            {/* Rate limits */}
      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold">Rate Limits</h2>
        <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
          <p><strong>Free:</strong> 100 requests/hour</p>
          <p><strong>Pro:</strong> 1,000 requests/hour</p>
          <p><strong>Enterprise:</strong> 10,000 requests/hour</p>
        </div>
      </section>
    </main>
      <Footer />
    </div>
  );
}
