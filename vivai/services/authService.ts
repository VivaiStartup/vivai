export type MeResponse = {
  user: { id: number; email?: string | null; name?: string | null } | null;
};

export async function me(): Promise<MeResponse> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return { user: null };
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Login failed (${res.status})`);
  }
  return res.json();
}

export async function register(name: string, email: string, password: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Register failed (${res.status})`);
  }
  return res.json();
}

export async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export function startGoogleLogin() {
  // backend: /api/auth/google/start fa redirect a Google
  window.location.href = "/api/auth/google/start";
}