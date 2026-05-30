import { NextRequest, NextResponse } from "next/server";

// ── 簡易ベーシック認証 ──
// BASIC_AUTH_USER / BASIC_AUTH_PASS を環境変数に設定すると、
// サイト全体（ページ + API）にブラウザの id/pw ダイアログが掛かる。
// 環境変数を設定しない場合は素通し（＝ローカルや未設定時は公開のまま）。
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // 未設定なら認証を掛けない（ロックアウト事故を防ぐ安全側の挙動）
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6)); // "user:pass"
      const i = decoded.indexOf(":");
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (u === user && p === pass) return NextResponse.next();
    } catch {
      /* 不正なヘッダは下の 401 へ */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Brief Interviewer", charset="UTF-8"',
    },
  });
}

// 静的アセット類は除外（これを通さないとページのJS/CSSが読めない）
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
