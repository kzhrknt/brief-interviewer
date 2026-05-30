import Anthropic from "@anthropic-ai/sdk";

// ── 媒体非依存のインタビュー方針（記事のプロンプトをsystem化）──
// 安定したプレフィックスとして prompt cache に載せる。
export const SYSTEM_PROMPT = `あなたは、クライアントの「ざっくりしたブリーフ」の解像度を上げるプロのインタビュアーです。
ブランド・事業・クリエイティブの観点から、依頼者本人もまだ言語化できていない
判断基準・前提・制約・優先順位を、対話によって引き出すことが役割です。

# 進め方
- 一度にすべてを聞かず、ask_user ツールで 1 回につき 3〜4 問のまとまりを投げます。
- 各設問には、答えやすいように 2〜4 個の選択肢を必ず添えます（自由記述は UI 側で常に可能）。
- 各設問には rationale（なぜこれを聞くのか）を一言で添えます。
- 設問は表面的・自明なもの（「予算は？」「納期は？」だけ等）を避け、
  裏の真因・判断基準・トレードオフがあぶり出される深掘りにします。
- 特に次の観点を順にカバーします：
  1. 本当の課題（ブリーフの要望の裏にある真因・トリガー）
  2. ターゲットの解像度（誰の、どんな状況・感情を動かすか）
  3. 差別化・ポジショニング・世界観
  4. 成功の定義（何をもって成功と言えるか＝評価基準）
  5. 制約条件（予算・期間・社内事情・絶対に外せない点・タブー）
  6. 意思決定の関門（誰の承認が要るか）
  7. 優先順位とトレードオフ（何を取るために何を捨てられるか）

# 継続と終了
- ユーザーの回答を踏まえ、まだ曖昧な点が残るなら ask_user で深掘りを続けます。
- 一般に 3〜6 ラウンド程度を目安に、十分に解像度が上がったと判断したら
  submit_brief ツールで構造化ブリーフを書き出して終了します。
- ユーザーが「もう十分」「まとめて」と言ったら、その時点で submit_brief を呼びます。
- submit_brief では title（プロジェクト/サービスの呼び名）、summary（このブリーフを一文で言うと）、
  sections（背景と真因 / ターゲット / ポジショニング・差別化 / 成功の定義 / 制約条件 /
  意思決定の関門 / 優先順位とトレードオフ などを label と body に分けて）、
  decisions（主要な決定事項を key と value の対で 8〜16 個）を埋めます。
  body は読みやすい日本語で。箇条書きにしたい部分は行頭を「- 」で始めます。

# 重要なルール
- 各ターンでは、ask_user か submit_brief の **どちらか一方のツールを必ず 1 回だけ** 呼びます。
- ツールを呼ばずに通常テキストだけで返答してはいけません。
- 日本語で、対等で率直なトーン。相手を見下さない。誘導しすぎない（選択肢に偏りを作らない）。`;

export const ASK_TOOL: Anthropic.Tool = {
  name: "ask_user",
  description:
    "ブリーフを明確化するための質問群を、選択肢つきでユーザーに投げる。1回につき3〜4問。",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "この回に投げる質問のまとまり（3〜4問）",
        items: {
          type: "object",
          properties: {
            header: {
              type: "string",
              description: "この質問のカテゴリを表す短いラベル（例: 真因 / ターゲット / 成功定義）",
            },
            question: { type: "string", description: "質問本文" },
            rationale: {
              type: "string",
              description: "なぜこれを聞くのか（一言）。UIで補足表示される",
            },
            multiSelect: {
              type: "boolean",
              description: "複数選択を許すならtrue",
            },
            options: {
              type: "array",
              description: "回答の選択肢（2〜4個）",
              items: {
                type: "object",
                properties: {
                  label: { type: "string", description: "選択肢の見出し" },
                  description: {
                    type: "string",
                    description: "選択肢の補足説明",
                  },
                },
                required: ["label"],
              },
            },
          },
          required: ["header", "question", "options"],
        },
      },
    },
    required: ["questions"],
  },
};

export const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_brief",
  description:
    "全要件が固まったら、構造化されたブリーフを書き出して終了する。",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "プロジェクト/サービスの呼び名（仮でよい）",
      },
      summary: {
        type: "string",
        description: "このブリーフを一文で言うと（コアの要約）",
      },
      sections: {
        type: "array",
        description:
          "背景と真因 / ターゲット / ポジショニング・差別化 / 成功の定義 / 制約条件 / 意思決定の関門 / 優先順位とトレードオフ など",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "セクション見出し" },
            body: {
              type: "string",
              description: "本文。箇条書きにする行は行頭を「- 」で始める",
            },
          },
          required: ["label", "body"],
        },
      },
      decisions: {
        type: "array",
        description: "主要な決定事項（8〜16個）",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "項目名" },
            value: { type: "string", description: "決定内容（簡潔に）" },
          },
          required: ["key", "value"],
        },
      },
    },
    required: ["title", "summary", "sections", "decisions"],
  },
};

// ── クライアント⇄サーバ間でやり取りする型 ──
export type AskOption = { label: string; description?: string };
export type AskQuestion = {
  header: string;
  question: string;
  rationale?: string;
  multiSelect?: boolean;
  options: AskOption[];
};

export type BriefDoc = {
  title: string;
  summary: string;
  sections: { label: string; body: string }[];
  decisions: { key: string; value: string }[];
};

export type InterviewAction =
  | { type: "ask"; toolUseId: string; questions: AskQuestion[] }
  | { type: "brief"; toolUseId: string; brief: BriefDoc }
  | { type: "text"; text: string };
