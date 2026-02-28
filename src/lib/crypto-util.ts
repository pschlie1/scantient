/**
 * Simple XOR obfuscation for sensitive config values (e.g. API tokens).
 * NOT cryptographic security — just obfuscation to avoid storing plaintext.
 */
export function obfuscate(value: string): string {
  const secret = process.env.JWT_SECRET ?? "default-secret";
  const secretBytes = Buffer.from(secret, "utf8");
  const valueBytes = Buffer.from(value, "utf8");
  const result = Buffer.alloc(valueBytes.length);
  for (let i = 0; i < valueBytes.length; i++) {
    result[i] = valueBytes[i] ^ secretBytes[i % secretBytes.length];
  }
  return result.toString("base64");
}

export function deobfuscate(encoded: string): string {
  const secret = process.env.JWT_SECRET ?? "default-secret";
  const secretBytes = Buffer.from(secret, "utf8");
  const valueBytes = Buffer.from(encoded, "base64");
  const result = Buffer.alloc(valueBytes.length);
  for (let i = 0; i < valueBytes.length; i++) {
    result[i] = valueBytes[i] ^ secretBytes[i % secretBytes.length];
  }
  return result.toString("utf8");
}
