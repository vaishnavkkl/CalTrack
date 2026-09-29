async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, payload?: unknown) => request<T>(path, {
    method: 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  }),
  patch: <T>(path: string, payload: unknown) => request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  put: <T>(path: string, payload: unknown) => request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
