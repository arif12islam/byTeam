/**
 * Cloudflare Worker that lets a device which only speaks plain HTTP (like the
 * ZKTeco K40H) reach byTeam on Vercel, which only speaks HTTPS. See
 * docs/DEVICE_SETUP.md, Path B3.
 *
 * The device talks to http://adms.bykorp.com/iclock/... and this passes each
 * request on to https://byteam.bykorp.com/iclock/... unchanged. Anything that
 * is not an /iclock address is refused, so the relay cannot be used to reach
 * the admin screens. It stores nothing.
 *
 * Paste this into a new Worker in the Cloudflare dashboard. It is not part of
 * the app and is not deployed with it.
 */

const TARGET = "https://byteam.bykorp.com";

const relay = {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/iclock/")) {
      return new Response("Not found\n", { status: 404 });
    }

    const headers = new Headers(request.headers);
    headers.delete("host");

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const reply = await fetch(TARGET + url.pathname + url.search, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });

    // Pass the reply back as it came, as plain text the device understands.
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  },
};

export default relay;
