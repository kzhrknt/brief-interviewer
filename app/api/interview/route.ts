import Anthropic from "@anthropic-ai/sdk";
import {
  SYSTEM_PROMPT,
  ASK_TOOL,
  SUBMIT_TOOL,
  type InterviewAction,
} from "@/lib/interview";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY が未設定です。.env.local を作成してキーを入れてください。" },
      { status: 500 },
    );
  }

  let messages: Anthropic.MessageParam[];
  let systemRaw: unknown;
  try {
    ({ messages, system: systemRaw } = await req.json());
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  // UI で編集されたプロンプトがあれば優先（無ければ既定）。暴走防止に上限だけ設ける。
  const system =
    typeof systemRaw === "string" && systemRaw.trim()
      ? systemRaw.slice(0, 20000)
      : SYSTEM_PROMPT;

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      tools: [ASK_TOOL, SUBMIT_TOOL],
      messages,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    let action: InterviewAction;
    if (toolUse?.name === "ask_user") {
      action = {
        type: "ask",
        toolUseId: toolUse.id,
        questions: (toolUse.input as any).questions ?? [],
      };
    } else if (toolUse?.name === "submit_brief") {
      const input = toolUse.input as any;
      action = {
        type: "brief",
        toolUseId: toolUse.id,
        brief: {
          title: input.title ?? "ブリーフ",
          summary: input.summary ?? "",
          sections: Array.isArray(input.sections) ? input.sections : [],
          decisions: Array.isArray(input.decisions) ? input.decisions : [],
        },
      };
    } else {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      action = { type: "text", text };
    }

    return Response.json({
      assistant: response.content, // 完全な content を返す（thinking/tool_use を保持）
      action,
      usage: response.usage,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return Response.json(
        { error: `${err.status ?? ""} ${err.message}`.trim() },
        { status: 502 },
      );
    }
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
