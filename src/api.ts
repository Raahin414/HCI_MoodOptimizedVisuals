export type Credentials = { id: string; token: string };
export async function api(path: string, body?: unknown, token?: string, method?: string) {
  const response = await fetch('/api' + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    let message = 'The server could not save this change. Please retry.';
    try {
      message = (await response.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
export const readCredentials = (): Credentials | null => {
  try {
    return JSON.parse(localStorage.getItem('moodspace-session') || 'null');
  } catch {
    return null;
  }
};
export const writeCredentials = (c: Credentials | null) => {
  c
    ? localStorage.setItem('moodspace-session', JSON.stringify(c))
    : localStorage.removeItem('moodspace-session');
};
