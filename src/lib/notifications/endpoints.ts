/**
 * The push services a browser can hand out an address for. The server only
 * ever sends to one of these, so a made-up address cannot make it call some
 * other web address.
 */
const ALLOWED = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
];
const ALLOWED_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];

export function isPushEndpoint(value: string): boolean {
  if (value.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  return ALLOWED.includes(url.hostname) || ALLOWED_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
}
