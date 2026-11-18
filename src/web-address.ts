// Only promote text that can be opened as a web address.
export function webAddress(input: string): string | undefined {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return;
  const explicit = /^https?:\/\//i.test(raw);
  const host = raw.split(/[/?#]/, 1)[0];
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  if (!explicit && !local && !/^(?:[^.:@]+\.)+[^.:@]+(?::\d+)?$/.test(host)) return;
  try {
    return new URL(explicit ? raw : (local ? "http://" : "https://") + raw).href;
  } catch {
    return;
  }
}
