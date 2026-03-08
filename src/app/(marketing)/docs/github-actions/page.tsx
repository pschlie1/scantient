import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "GitHub Actions CI Integration — Scantient" };

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-surface-raised p-4 text-sm text-heading">
      <code>{children}</code>
    </pre>
  );
}

const workflowYaml = `name: Scantient Security Scan
on: [push, pull_request]

jobs:
  scantient:
    runs-on: ubuntu-latest
    steps:
      - name: Run Scantient Security Scan
        run: |
          RESULT=$(curl -s -X POST https://scantient.com/api/public/ci-scan \\
            -H "X-API-Key: \${{ secrets.SCANTIENT_API_KEY }}" \\
            -H "Content-Type: application/json" \\
            -d '{"url": "\${{ env.APP_URL }}", "failOn": "critical"}')
          echo "$RESULT" | jq .
          PASSED=$(echo "$RESULT" | jq -r '.passed')
          if [ "$PASSED" != "true" ]; then
            echo "Scantient scan failed — security issues detected"
            exit 1
          fi`;

const curlExample = `curl -s -X POST https://scantient.com/api/public/ci-scan \\
  -H "X-API-Key: vs_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://your-app.com", "failOn": "critical"}'`;

const responseExample = `{
  "passed": true,
  "score": 87,
  "grade": "B",
  "findingsCount": 3,
  "criticalCount": 0,
  "highCount": 1,
  "mediumCount": 2,
  "summary": "1 HIGH, 2 MEDIUM findings detected",
  "findings": [...],
  "dashboardUrl": "https://scantient.com/apps/clx123..."
}`;

const badgeMarkdown = `[![Scantient Security](https://scantient.com/api/public/badge?url=https://your-app.com&key=vs_your_key)](https://scantient.com)`;

export default function GitHubActionsPage() {
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="mb-4">
          <Link href="/docs" className="text-sm text-muted hover:text-heading">← Docs</Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold">GitHub Actions CI Integration</h1>
        <p className="mb-10 text-body">
          Run automated security scans on every push or pull request with Scantient&apos;s CI endpoint.
          Fail your pipeline automatically if critical vulnerabilities are detected.
        </p>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">Quick Start</h2>
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-heading">
            <li>Generate an API key in <Link href="/settings/api-keys" className="text-info underline">Settings → API Keys</Link>.</li>
            <li>Add it as a GitHub secret named <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">SCANTIENT_API_KEY</code>.</li>
            <li>Set your app URL as an environment variable or inline in the workflow.</li>
            <li>Add the workflow below to <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">.github/workflows/scantient.yml</code>.</li>
          </ol>
          <Code>{workflowYaml}</Code>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">CI Endpoint Reference</h2>
          <div className="mb-4 rounded-lg border border-border p-6">
            <div className="mb-2 flex items-center gap-3">
              <span className="rounded bg-info/10 px-2 py-0.5 text-xs font-bold text-info">POST</span>
              <code className="text-sm font-semibold">/api/public/ci-scan</code>
            </div>
            <p className="mb-4 text-sm text-body">
              Runs a full Scantient security scan. Returns HTTP 200 if passed, 422 if failed.
            </p>
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted">Request</h4>
            <Code>{curlExample}</Code>
            <h4 className="mb-2 mt-4 text-xs font-semibold uppercase text-muted">Response</h4>
            <Code>{responseExample}</Code>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">Security Badge</h2>
          <p className="mb-4 text-sm text-body">Add a Scantient security badge to your README to show your security score at a glance.</p>
          <Code>{badgeMarkdown}</Code>
          <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4 text-sm text-body">
            <strong>Badge colors:</strong>
            <ul className="mt-2 list-disc pl-5 text-xs">
              <li><span className="font-medium text-success">Green</span>: score ≥ 80</li>
              <li><span className="font-medium text-warning">Yellow</span>: score 50–79</li>
              <li><span className="font-medium text-error">Red</span>: score &lt; 50</li>
            </ul>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-xl font-semibold">Threshold Levels</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised">
                <tr className="border-b text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">failOn value</th>
                  <th className="px-4 py-3 font-medium">Fails CI when</th>
                  <th className="px-4 py-3 font-medium">Recommended for</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                <tr><td className="px-4 py-3 font-mono">critical</td><td className="px-4 py-3">Any CRITICAL finding exists</td><td className="px-4 py-3">Default: all projects</td></tr>
                <tr><td className="px-4 py-3 font-mono">high</td><td className="px-4 py-3">Any HIGH or CRITICAL finding exists</td><td className="px-4 py-3">Production-critical services</td></tr>
                <tr><td className="px-4 py-3 font-mono">medium</td><td className="px-4 py-3">Any MEDIUM, HIGH, or CRITICAL finding exists</td><td className="px-4 py-3">High-compliance environments</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
