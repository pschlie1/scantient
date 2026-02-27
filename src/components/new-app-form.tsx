"use client";

import { useState } from "react";

type FormState = {
  name: string;
  url: string;
  ownerEmail: string;
  ownerName: string;
  criticality: "low" | "medium" | "high";
};

const initialState: FormState = {
  name: "",
  url: "",
  ownerEmail: "",
  ownerName: "",
  criticality: "medium",
};

export function NewAppForm() {
  const [data, setData] = useState<FormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setData(initialState);
        window.location.reload();
      } else {
        const body = await res.json();
        setError(body.error?.fieldErrors ? "Please fix validation errors" : "Could not register app");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Register app</h3>
        <p className="text-xs text-gray-500">Add an app to start continuous monitoring</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 p-4">
        <Input
          label="App name"
          placeholder="Customer Portal"
          value={data.name}
          onChange={(v) => setData({ ...data, name: v })}
          required
        />
        <Input
          label="App URL"
          placeholder="https://app.company.com"
          type="url"
          value={data.url}
          onChange={(v) => setData({ ...data, url: v })}
          required
        />
        <Input
          label="Owner email"
          placeholder="owner@company.com"
          type="email"
          value={data.ownerEmail}
          onChange={(v) => setData({ ...data, ownerEmail: v })}
          required
        />
        <Input
          label="Owner name"
          placeholder="Optional"
          value={data.ownerName}
          onChange={(v) => setData({ ...data, ownerName: v })}
        />

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Criticality</label>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            value={data.criticality}
            onChange={(e) => setData({ ...data, criticality: e.target.value as FormState["criticality"] })}
          >
            <option value="low">Low — internal tool, limited users</option>
            <option value="medium">Medium — business-critical internal</option>
            <option value="high">High — customer-facing or handles sensitive data</option>
          </select>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add app to monitoring"}
        </button>
      </form>
    </div>
  );
}

function Input({
  label,
  required,
  ...props
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      <input
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
