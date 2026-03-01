import type { Metadata } from "next";
import MarketingNav from "@/components/marketing-nav";
import Footer from "@/components/footer";

export const metadata: Metadata = {
  title: "System Status — Scantient",
  description: "Current operational status of Scantient services.",
};

const services = [
  { name: "Dashboard & Web App", status: "operational" },
  { name: "Security Scanner", status: "operational" },
  { name: "Continuous Monitoring", status: "operational" },
  { name: "Alert Delivery", status: "operational" },
  { name: "REST API", status: "operational" },
  { name: "MCP Endpoint", status: "operational" },
  { name: "Authentication", status: "operational" },
  { name: "Report Generation", status: "operational" },
];

const incidents: { date: string; title: string; body: string; resolved: boolean }[] = [];

function StatusDot({ status }: { status: string }) {
  if (status === "operational") {
    return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />;
  }
  if (status === "degraded") {
    return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />;
  }
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />;
}

function StatusLabel({ status }: { status: string }) {
  const classes =
    status === "operational"
      ? "text-green-600"
      : status === "degraded"
        ? "text-yellow-600"
        : "text-red-600";
  return (
    <span className={`text-sm font-medium capitalize ${classes}`}>{status}</span>
  );
}

export default function StatusPage() {
  const allOperational = services.every((s) => s.status === "operational");

  return (
    <div className="bg-white">
      <MarketingNav />

      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-gray-400">Status</p>

        {/* Overall status banner */}
        <div
          className={`flex items-center gap-3 rounded-2xl px-6 py-5 ${
            allOperational ? "bg-green-50 border border-green-100" : "bg-yellow-50 border border-yellow-100"
          }`}
        >
          <span
            className={`flex h-4 w-4 rounded-full ${allOperational ? "bg-green-500" : "bg-yellow-400"}`}
          />
          <div>
            <p className="font-semibold text-gray-900">
              {allOperational ? "All systems operational" : "Some systems degraded"}
            </p>
            <p className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Service list */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Services</h2>
          <div className="mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-100">
            {services.map((service) => (
              <div key={service.name} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <StatusDot status={service.status} />
                  <span className="text-sm text-gray-800">{service.name}</span>
                </div>
                <StatusLabel status={service.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Uptime */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Uptime (last 90 days)</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Dashboard", value: "99.97%" },
              { label: "Scanner", value: "99.95%" },
              { label: "API", value: "99.98%" },
              { label: "Monitoring", value: "99.93%" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-gray-100 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{item.value}</p>
                <p className="mt-1 text-xs text-gray-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Incidents */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Incident history</h2>
          {incidents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
              <p className="text-sm text-gray-400">No incidents in the last 90 days. 🎉</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {incidents.map((inc) => (
                <div key={inc.title} className="rounded-xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{inc.title}</p>
                    <span className="text-xs text-gray-400">{inc.date}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{inc.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subscribe */}
        <div className="mt-12 rounded-2xl bg-gray-50 p-6">
          <p className="text-sm font-medium text-gray-700">Get notified about incidents and maintenance</p>
          <p className="mt-1 text-sm text-gray-500">
            Email{" "}
            <a href="mailto:status@scantient.com" className="text-black underline hover:no-underline">
              status@scantient.com
            </a>{" "}
            to be added to our incident notification list.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
