// Fetch wrapper: attaches access token, transparently refreshes once on 401.

export interface SessionUser {
  id: string;
  username: string;
  role: "student" | "teacher" | "admin";
  name: string;
}

const store = {
  get access() { return sessionStorage.getItem("es_access"); },
  get refresh() { return sessionStorage.getItem("es_refresh"); },
  get user(): SessionUser | null {
    const raw = sessionStorage.getItem("es_user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  },
  get csrf() { return sessionStorage.getItem("es_csrf"); },
  set(tokens: { accessToken: string; refreshToken: string; csrfToken?: string; user: SessionUser }) {
    sessionStorage.setItem("es_access", tokens.accessToken);
    sessionStorage.setItem("es_refresh", tokens.refreshToken);
    if (tokens.csrfToken) sessionStorage.setItem("es_csrf", tokens.csrfToken);
    sessionStorage.setItem("es_user", JSON.stringify(tokens.user));
  },
  clear() {
    sessionStorage.removeItem("es_access");
    sessionStorage.removeItem("es_refresh");
    sessionStorage.removeItem("es_csrf");
    sessionStorage.removeItem("es_user");
  },
};

export const session = store;

async function tryRefresh(): Promise<boolean> {
  const refresh = store.refresh;
  if (!refresh) return false;
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    store.clear();
    return false;
  }
  store.set(await res.json());
  return true;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(store.access ? { Authorization: `Bearer ${store.access}` } : {}),
        ...(store.csrf ? { "X-CSRF-Token": store.csrf } : {}),
        ...init.headers,
      },
    });

  let res = await doFetch();
  if (res.status === 401 && store.refresh && (await tryRefresh())) {
    res = await doFetch();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const data = await api<{ accessToken: string; refreshToken: string; csrfToken: string; user: SessionUser }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ username, password }) }
  );
  store.set(data);
  return data.user;
}

export function logout() {
  store.clear();
}
