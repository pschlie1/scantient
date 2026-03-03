"use client";

import { useState } from "react";

interface Props {
  domain: string;
}

export function ShareScoreButton({ domain }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `https://scantient.com/score/${domain}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API isn't available
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      title={`Copy shareable score URL for ${domain}`}
    >
      {copied ? (
        <>
          <span className="text-green-600">✓</span>
          Copied!
        </>
      ) : (
        <>
          <span>🔗</span>
          Share score
        </>
      )}
    </button>
  );
}
