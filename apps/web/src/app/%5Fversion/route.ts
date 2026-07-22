import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      commitSha: process.env.NEXT_PUBLIC_APP_COMMIT_SHA ?? "development",
      nextBuildId: process.env.NEXT_PUBLIC_NEXT_BUILD_ID ?? "development",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
