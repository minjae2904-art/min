// PIN is only a local "nosy person" lock. Real data protection comes later from Supabase Auth + RLS.
const SALT = "krob-pin-v1";

export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + pin));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
