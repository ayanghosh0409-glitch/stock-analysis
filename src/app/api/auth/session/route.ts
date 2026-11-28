import type { NextRequest } from "next/server";
import { authConfigured, currentUser, originOf } from "@/lib/authServer";

// Who is signed in, for the page to show the right header. Per person, so never cached. The pages themselves stay static and ask this.
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  return Response.json({ configured: authConfigured(originOf(req)), user: user ? { email: user.email, name: user.name } : null }, { headers: { "Cache-Control": "no-store" } });
}
