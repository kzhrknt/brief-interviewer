# PJ-BriefInterviewer 運用メモ（Claude/自分用）

ざっくりしたクライアントブリーフを、AIが選択式で深掘りヒアリングして構造化ブリーフに仕上げるプロトタイプ。Claude Code の AskUserQuestionTool を自前の Web UI で再現したもの。

このファイルは、このプロジェクトを再び触るとき最初に読む前提メモ。ユーザー向けの使い方は `README.md` に、思想的背景は wiki（後述）にある。

---

## 一目で把握

| 項目 | 内容 |
|------|------|
| 公開URL | https://brief-interviewer.vercel.app |
| アクセス制限 | Basic Auth で知り合い限定。**id / pw とも `friends`** |
| リポジトリ | https://github.com/kzhrknt/brief-interviewer（public） |
| Vercel | kuzzkens-projects/brief-interviewer（GitHub連携済み） |
| スタック | Next.js 14 App Router + @anthropic-ai/sdk |
| モデル | `claude-sonnet-4-6`（adaptive thinking / effort medium） |

---

## アーキテクチャ

tool use（function calling）のループを自前UIで回しているだけ。サーバはステートレスで、会話履歴（messages）はクライアントが保持して毎ターン送り返す。

- `lib/interview.ts` … ツール定義 `ask_user`（質問+選択肢を投げる）と `submit_brief`（構造化ブリーフを返す）。`ASK_TOOL` / `SUBMIT_TOOL`。
- `lib/prompt.ts` … インタビュー方針の system プロンプト `DEFAULT_SYSTEM_PROMPT`。**SDK非依存**にしてあるのが重要（クライアントからも import するため。interview.ts は Anthropic SDK を import するのでクライアントに混ぜられない）。
- `app/api/interview/route.ts` … 1ターン分の Claude 呼び出し。body の `messages` と任意の `system` を受け取り、`system` があれば優先・無ければ既定（上限2万字）。tool_use を見て `ask` / `brief` / `text` を返す。
- `app/page.tsx` … カードUI。質問への回答、ローディング+キャンセル、右上のプロンプト編集、完成ブリーフのリッチ表示（`RichBrief`）。
- `middleware.ts` … Basic Auth（後述）。

### 主要な設計判断（変える前に理由を読む）

- **モデルは Sonnet + effort medium**。当初 `claude-opus-4-8` + effort high だったが、1ターンの待ち時間が長かったので速度優先で下げた。質が落ちたら effort を上げるか、質問は Sonnet・最終ブリーフだけ Opus の使い分けもあり。
- **submit_brief は構造化出力**（title / summary / sections[] / decisions[]）。md文字列ではなく構造で受け、`RichBrief` でデザインして段階的に立ち上げる。md保存/コピーは `toMarkdown()` でその場生成。「できた！」の体験を作るのが狙いなので、ここを素の `<pre>` に戻さない。
- **system プロンプトはUIで確認・編集できる**。右上リンク → モーダル。編集値はそのセッションのAPI呼び出しに渡る（未編集なら既定）。本体は `lib/prompt.ts`。
- **デザインは baku89 の corporate-poetry を参照**した淡いパステル+明朝+細い円の静かなエディトリアル。フォントは Google Fonts を layout の `<link>` で読み込み（next/font は日本語フォントで詰まりやすいので避けた）。
- **ローディングは演出**（細い円が回る + 明朝の状況メッセージ巡回）。待機中も質問カードは残し、上に半透明オーバーレイを重ねる（回答を見ながら待てる）。`AbortController` でキャンセル可能。

---

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API。未設定だと API ルートが親切な500を返す |
| `BASIC_AUTH_USER` | 任意 | Basic Auth のID。両方セットで認証ON |
| `BASIC_AUTH_PASS` | 任意 | Basic Auth のPW |

- ローカルは `.env.local`（gitignore済み）。`.env.local.example` を参照。
- 本番は Vercel の Environment Variables。**現状 Production に3つとも設定済み**。
- Basic Auth は**未設定なら素通し（公開）**になる安全設計（middleware が env 未設定時 next()）。一時公開したいときは2変数を削除して再デプロイ。

### セキュリティ運用メモ

- `ANTHROPIC_API_KEY` は、ローカル `.env.local` の値をそのまま Vercel にコピーして設定した（＝同じ鍵が2か所）。**別鍵に分離はしていない**。気になるならローテーション（新キー発行→Vercel差し替え→旧キーrevoke）。
- シークレットをAIに読ませるのは避ける方針。今回 API キーは「桁数だけ表示して値はstdin経由」で扱い transcript には出していない。BASIC_AUTH（低リスクな共有PW）は CLI で設定した。
- Basic Auth でAPIルートも保護されるので、無認証で勝手に課金される事故は防げている。**もし認証を外して一般公開する場合は、Anthropic Console で spend limit を設定すること**（公開URLの利用は全部こちら持ちの課金）。

---

## デプロイ運用

GitHub ↔ Vercel 連携済み。**`git push` するだけで自動ビルド＆デプロイ**。

- `main` に push → 本番（brief-interviewer.vercel.app）に反映
- 別ブランチ/PR → Preview URL が自動発行
- 推奨フロー：作業ブランチ → push で Preview 確認 → main にマージで本番
- ビルド失敗時は今の本番がそのまま残る（壊れた版に差し替わらない）。Vercel管理画面の Deployments で Instant Rollback 可。

### ハマりどころ（重要）

- **ユーザーの `npm run dev` が動いている最中に `npm run build` や2つ目の `npm run dev` を回さない**。同じ `.next` を奪い合って dev サーバが壊れ、サーバーエラーになる（このセッションで一度やらかした）。動作確認は型チェック `npx tsc --noEmit` で済ませるか、別ポートでもdevは1つに。直し方は `rm -rf .next && npm run dev`。
- **環境変数は次のデプロイから有効**。Vercel側で env を変えたら必ず再デプロイ（空コミットpush か 管理画面Redeploy）。
- `vercel env add ... preview` は branch 指定を求められて失敗しがち。Production だけで足りるなら気にしない。

---

## アナリティクス

`@vercel/analytics` を導入済み（`app/layout.tsx` に `<Analytics />`）。Cookieレス。Vercel管理画面の Analytics タブに数字が出る。広告/コンテンツブロッカーがあると計測されないことがある。

---

## この先の構想（v2 の種）

「ヒアリング用promptを組織で複利的に育てる」枠組みが議論済み。若手がヒアリング → 熟練者がレビュー → 抜けをpromptに反映、を**システムで担保**する案。

- prompt-as-code（版管理）＋ PRレビュー（承認ゲート）＋ CI（熟練者のチェック観点を rubric 化して抜けを機械検出）＋ テレメトリ（版ごと品質計測）
- 必要になるもの：永続ストア（Postgres/Supabase）、ロール認証（junior/expert/admin）、レビュー画面、prompt/rubric の版管理
- いまは prompt が静的1本＋per-session編集なので、永続化が最初の一歩

詳しくは wiki の概念ページ参照（下記）。

---

## 関連ナレッジ（RS-Wiki）

このプロダクトは発信コンテンツと地続き。Wiki ルート: `03_RESOURCES/RS-Wiki/`

- master論考: `content/01-master/2026-05-30-hearing-resolution-brief-interviewer.md`（ヒアリングの質＝聞き手の解像度）
- Chameleonレター: `content/04-chameleon/drafts/20260530_same-intelligence-where-we-diverge.md`
- Zenn記事: `content/08-zenn/drafts/20260529_brief-resolution-with-askuserquestion.md`
- X告知ドラフト: `content/02-x/drafts/20260530_brief-interviewer-announce.md`（リンク扱い未決：知り合い限定なので公開Xにリンクは貼れない。リンク無し+DM誘導 or 一般公開+spend limit）
- 概念: `wiki/concepts/hearing-knowledge-loop.md` / `wiki/concepts/compounding-feedback.md`
- 統合: `wiki/syntheses/compounding-difference.md`（誰もが優れたAIにアクセスできる時代に人/組織はどこで差をつけるか）

---

## 未決・TODO（このセッション終了時点）

- X告知の本命案決定とリンクの扱い（公開 or 限定）
- Chameleonレターの published 移動（承認待ち）
- Basic Auth の Preview 環境ぶんは未設定（PR仮URLを人に見せないなら不要）
- API キーのローテーション（するか様子見か。現状は様子見でOKと判断）
