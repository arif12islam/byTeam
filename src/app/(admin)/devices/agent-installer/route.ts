import { agentInstallerScript } from "@/lib/devices/agent-installer";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

/**
 * The office agent's Windows installer, with this byTeam's address filled in:
 * /devices/agent-installer. Owner and HR only. The public address comes from
 * BETTER_AUTH_URL, which is set to it in every deployment, so it is right
 * behind a proxy too; the request's own address is the fallback.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot download the office agent." }, { status: 403 });

  const server = (process.env.BETTER_AUTH_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
  return new Response(agentInstallerScript(server), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="install-byteam-agent.ps1"',
      "Cache-Control": "no-store",
    },
  });
}
