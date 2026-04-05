import { NextRequest, NextResponse } from "next/server";
import { requireLiveReadAccess } from "@/lib/kotc-live";
import { normalizeSudyamFormat } from "@/lib/sudyam-launch";
import {
  SudyamBootstrapError,
  resolveSudyamBootstrap,
} from "@/lib/sudyam-bootstrap";
import {
  bootstrapThaiJudgeState,
  isThaiJudgeError,
} from "@/lib/thai-live";
import { THAI_STRUCTURAL_DRIFT_LOCKED_CODE } from "@/lib/thai-judge-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;

  const tournamentId = String(req.nextUrl.searchParams.get("tournamentId") || "").trim();
  const format = normalizeSudyamFormat(req.nextUrl.searchParams.get("format"));

  try {
    const payload = await resolveSudyamBootstrap(tournamentId, format);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SudyamBootstrapError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[SUDYAM] bootstrap.get:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const access = requireLiveReadAccess(req);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tournamentId =
    String(body.tournamentId || req.nextUrl.searchParams.get("tournamentId") || "").trim();
  const format = normalizeSudyamFormat(body.format || req.nextUrl.searchParams.get("format"));
  const seed = Math.trunc(Number(body.seed) || 0);

  if (!tournamentId) {
    return NextResponse.json({ error: "tournamentId is required" }, { status: 400 });
  }
  if (format !== "thai") {
    return NextResponse.json({ error: "Thai bootstrap POST only supports Thai tournaments" }, { status: 400 });
  }

  try {
    await bootstrapThaiJudgeState(tournamentId, { seed: seed >= 1 ? seed : undefined });
    const payload = await resolveSudyamBootstrap(tournamentId, format);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SudyamBootstrapError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isThaiJudgeError(error)) {
      const code = error.code === THAI_STRUCTURAL_DRIFT_LOCKED_CODE ? error.code : undefined;
      return NextResponse.json(
        code ? { error: error.message, code } : { error: error.message },
        { status: error.status },
      );
    }
    console.error("[SUDYAM] bootstrap.post:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
