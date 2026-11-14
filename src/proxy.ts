import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "@/lib/gate";

export function proxy(req: NextRequest) {
  if (authorized(req.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ICT Hub"' },
  });
}

// The TradingView webhook cannot send a browser password, so it is excluded here.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhook).*)"],
};
