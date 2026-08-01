/**
 * Runs once when the server starts.
 *
 * Some networks (common on local dev machines and containers) advertise an IPv6 route that
 * isn't actually reachable. Node's default connection racing ("Happy Eyeballs", enabled by
 * default since Node 20) can fail *outright* in that situation instead of falling back cleanly
 * to IPv4 — surfacing as an opaque `fetch failed` / `NeonDbError` with no further detail, even
 * though a plain IPv4 connection to the same host succeeds instantly. This hit the Neon DB
 * client specifically (its HTTP driver's `fetch` races both address families).
 *
 * `setDefaultAutoSelectFamily(false)` disables that racing process-wide, so every `net`/`tls`
 * connection — including the ones inside `fetch` and the Neon driver — just uses the first
 * resolved address sequentially, which is exactly what Node did before v20. It's a no-op on
 * networks where IPv6 genuinely works.
 *
 * `dns.setDefaultResultOrder("ipv4first")` is belt-and-suspenders on top of that: with racing
 * disabled, Node connects to addresses sequentially in whatever order `dns.lookup` returned
 * them, and on this kind of network that order isn't guaranteed to put a reachable address
 * first. Forcing IPv4 first means the *first* attempt is one we've verified actually connects.
 *
 * `instrumentation.ts` is bundled for both the Node and Edge runtimes, so `node:net`/`node:dns`
 * are imported dynamically behind the runtime check rather than statically at the top of the
 * file — a static import would otherwise fail Edge bundling, since those modules don't exist
 * there. This project's API routes all pin themselves to `runtime = "nodejs"` anyway.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [net, dns] = await Promise.all([import("node:net"), import("node:dns")]);
    net.setDefaultAutoSelectFamily(false);
    dns.setDefaultResultOrder("ipv4first");
  }
}
