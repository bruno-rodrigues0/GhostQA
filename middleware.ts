import { NextResponse, type NextRequest } from "next/server";

const publicLegacyScreenshotPath =
  /^\/runs\/[0-9a-f-]{36}\/[\w-]{1,128}\/[\w.-]{1,180}\.png$/i;

export function middleware(request: NextRequest) {
  if (publicLegacyScreenshotPath.test(request.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/runs/:path*"],
};
