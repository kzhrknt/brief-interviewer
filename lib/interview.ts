import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_SYSTEM_PROMPT } from "./prompt";

// 既定のインタビュー方針（UI で未編集のときに使う）。本体は ./prompt.ts。
export const SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

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
