# Brief Interviewer 🔍

ざっくりしたクライアントブリーフを貼ると、AIが**選択式でヒアリング**し、
本人も言語化できていなかった判断基準・制約・優先順位を引き出して、
**構造化ブリーフ（Markdown）**に仕上げるプロトタイプ。

Claude Code の `AskUserQuestionTool` を、自分のWeb UIで再現したもの。
Zenn記事「Claude Code にインタビューさせて、ざっくりしたクライアントブリーフの解像度を上げる」の実装版。

## 仕組み

Claude API の **tool use** を使い、Claudeに2つのツールを渡してループを回す。

- `ask_user` … Claudeが「質問＋選択肢」を投げてくる → カードUIで描画
- `submit_brief` … Claudeが「もう十分」と判断したら構造化ブリーフを吐く → 完成画面へ

サーバは状態を持たず、会話履歴（`messages`）はクライアントが保持して毎ターン送り返す。
`/app/api/interview/route.ts` が1ターン分のAPI呼び出しを担当する。

- モデル: `claude-opus-4-8`（adaptive thinking + effort high）
- system プロンプトは prompt cache に載せている（`cache_control: ephemeral`）
- インタビュー方針・ツール定義は `lib/interview.ts`

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # ANTHROPIC_API_KEY を記入
npm run dev
# http://localhost:3000
```

## 使い方

1. ブリーフ（箇条書きでOK）を貼って「ヒアリングを開始」
2. 出てくる質問カードに答える（選択 or 自由記述）。右ペインに解像度が積み上がる
3. 数ラウンド後、または「もう十分、まとめてもらう」で構造化ブリーフが生成される
4. コピー / .md保存

## リッチ化の余地（未実装）

- 「なぜこの質問か」を吹き出しでより目立たせる
- 構造化ブリーフを答えるたびにリアルタイム生成して右ペインに育てる
- クライアントへ共有リンクを発行（本人に答えてもらう）
- Notion / Slack へのエクスポート
- ストリーミング表示（現状は1ターンごとにまとめて返す）

## 注意

- これは解像度を上げる道具であり、意思決定の代行ではない
- 選択肢はこちらの前提を相手に乗せる行為でもある。フレーミングの偏りに注意
