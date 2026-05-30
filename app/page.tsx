"use client";

import { useEffect, useRef, useState } from "react";
import type { AskQuestion, BriefDoc, InterviewAction } from "@/lib/interview";

type Phase = "intake" | "interviewing" | "done";
type LogItem = { header: string; question: string; answer: string };
// 緩く扱う（Anthropic.MessageParam 相当をそのまま往復させる）
type Msg = { role: "user" | "assistant"; content: any };

const SAMPLE = `- 自社（地方の老舗和菓子メーカー）のブランドを刷新したい
- 若い層に響くようにしたい
- 競合との差別化をはっきりさせたい
- SNSで話題になるようにしたい
- 予算はあまりかけられない
- できれば半年くらいで形にしたい`;

const LOADING_MSGS = [
  "問いを組み立てています",
  "前提を解きほぐしています",
  "言葉になっていない判断基準を探しています",
  "トレードオフを見極めています",
  "ブリーフの解像度を上げています",
];

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intake");
  const [draft, setDraft] = useState(SAMPLE);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [ask, setAsk] = useState<{ toolUseId: string; questions: AskQuestion[] } | null>(null);
  const [sel, setSel] = useState<Record<number, Set<number>>>({});
  const [free, setFree] = useState<Record<number, string>>({});
  const [log, setLog] = useState<LogItem[]>([]);
  const [round, setRound] = useState(0);
  const [doc, setDoc] = useState<BriefDoc | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msgI, setMsgI] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // ローディング中はステータス文言をゆっくり切り替える
  useEffect(() => {
    if (!loading) return;
    setMsgI(0);
    const id = setInterval(
      () => setMsgI((i) => (i + 1) % LOADING_MSGS.length),
      2400,
    );
    return () => clearInterval(id);
  }, [loading]);

  async function callApi(next: Msg[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const action = data.action as InterviewAction;
      setMessages([...next, { role: "assistant", content: data.assistant }]);
      setNote("");
      if (action.type === "ask") {
        setAsk({ toolUseId: action.toolUseId, questions: action.questions });
        setSel({});
        setFree({});
        setRound((r) => r + 1);
      } else if (action.type === "brief") {
        setAsk(null);
        setDoc(action.brief);
        setPhase("done");
      } else {
        setAsk(null);
        setNote(action.text || "（応答を解釈できませんでした）");
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return; // キャンセルは静かに戻す
      setError(e.message ?? "エラーが発生しました");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
    // 初回（まだ質問が無い）でのキャンセルは入力画面に戻す
    if (!ask) setPhase("intake");
  }

  function start() {
    const next: Msg[] = [
      { role: "user", content: `次のクライアントブリーフを前提にヒアリングを始めてください。\n\n${draft}` },
    ];
    setPhase("interviewing");
    setLog([]);
    setRound(0);
    callApi(next);
  }

  function answerText(q: AskQuestion, i: number): string {
    const picked = [...(sel[i] ?? [])].map((oi) => q.options[oi]?.label).filter(Boolean);
    const ft = (free[i] ?? "").trim();
    return [...picked, ...(ft ? [ft] : [])].join(" / ");
  }

  function submitAnswers() {
    if (!ask) return;
    const payload = ask.questions.map((q, i) => ({
      header: q.header,
      question: q.question,
      answer: answerText(q, i) || "（未回答）",
    }));
    setLog((prev) => [...prev, ...payload]);
    const text = payload.map((p) => `Q(${p.header}): ${p.question}\nA: ${p.answer}`).join("\n\n");
    sendToolResult(text);
  }

  function wrapUp() {
    if (!ask) return;
    const partial = ask.questions
      .map((q, i) => {
        const a = answerText(q, i);
        return a ? `Q(${q.header}): ${q.question}\nA: ${a}` : null;
      })
      .filter(Boolean)
      .join("\n\n");
    const text =
      (partial ? partial + "\n\n" : "") +
      "ここまでの回答で十分です。これまでの内容で構造化ブリーフをまとめてください。";
    sendToolResult(text);
  }

  // ask はクリアしない（待機中も回答が見えるように残す）
  function sendToolResult(text: string) {
    if (!ask) return;
    const next: Msg[] = [
      ...messages,
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: ask.toolUseId, content: text }],
      },
    ];
    callApi(next);
  }

  function continueNudge() {
    const next: Msg[] = [...messages, { role: "user", content: "ヒアリングを続けてください。" }];
    callApi(next);
  }

  function toggle(qi: number, oi: number, multi: boolean) {
    setSel((prev) => {
      const cur = new Set(prev[qi] ?? []);
      if (multi) {
        cur.has(oi) ? cur.delete(oi) : cur.add(oi);
      } else {
        cur.clear();
        cur.add(oi);
      }
      return { ...prev, [qi]: cur };
    });
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>Brief Interviewer</h1>
        <p>ざっくりブリーフを貼ると、AIが選択式でヒアリングし、構造化ブリーフに仕上げます。</p>
      </header>

      <div className="main">
        {phase === "intake" && (
          <div className="card">
            <p className="eyebrow">Client Brief — 解像度を上げる</p>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="row" style={{ marginTop: 18 }}>
              <button className="primary" onClick={start} disabled={!draft.trim()}>
                ヒアリングを開始
              </button>
              <span className="spacer" />
              <button onClick={() => setDraft(SAMPLE)}>サンプルに戻す</button>
            </div>
          </div>
        )}

        {phase === "interviewing" && (
          <div className="card interview-card">
            {ask && (
              <div className={`qset${loading ? " is-waiting" : ""}`}>
                <p className="round-label">Round {round}</p>
                {ask.questions.map((q, i) => (
                  <div className="q-block" key={i}>
                    <div className="q-head">
                      <span className="chip">{q.header}</span>
                      {q.multiSelect && <span className="muted">（複数選択可）</span>}
                    </div>
                    <p className="q-text">{q.question}</p>
                    {q.rationale && <p className="q-why">なぜ聞くか: {q.rationale}</p>}
                    <div className="options">
                      {q.options.map((o, oi) => {
                        const on = sel[i]?.has(oi);
                        return (
                          <button
                            key={oi}
                            className={`opt${on ? " selected" : ""}`}
                            onClick={() => toggle(i, oi, !!q.multiSelect)}
                            disabled={loading}
                          >
                            <div className="opt-label">{o.label}</div>
                            {o.description && <div className="opt-desc">{o.description}</div>}
                          </button>
                        );
                      })}
                    </div>
                    <textarea
                      className="freetext"
                      placeholder="選択肢にない場合は自由記述…"
                      value={free[i] ?? ""}
                      onChange={(e) => setFree((p) => ({ ...p, [i]: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                ))}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="primary" onClick={submitAnswers} disabled={loading}>
                    回答して次へ
                  </button>
                  <button onClick={wrapUp} disabled={loading}>
                    もう十分、まとめてもらう
                  </button>
                </div>
              </div>
            )}

            {note && !loading && (
              <div>
                <p style={{ fontFamily: "var(--serif-jp)", fontSize: 17 }}>{note}</p>
                <button className="primary" onClick={continueNudge}>
                  続ける
                </button>
              </div>
            )}

            {loading && (
              <div className={`loading-overlay${ask ? " over-content" : ""}`}>
                <Loader />
                <p className="loading-msg" key={msgI}>
                  {LOADING_MSGS[msgI]}
                </p>
                <button className="cancel-btn" onClick={cancel}>
                  キャンセル
                </button>
              </div>
            )}

            {error && <p className="err" style={{ marginTop: 16 }}>⚠ {error}</p>}
          </div>
        )}

        {phase === "done" && doc && <RichBrief doc={doc} />}
      </div>

      <aside className="side card">
        <h3>解像度が上がった点</h3>
        {log.length === 0 && <p className="muted">回答するとここに積み上がります。</p>}
        {log.map((l, i) => (
          <div className="log-item" key={i}>
            <div className="lh">{l.header}</div>
            <div className="lq">{l.question}</div>
            <div className="la">{l.answer}</div>
          </div>
        ))}
      </aside>

      <footer className="credit">
        <span>Designed &amp; built by Kenta Kuzuhara</span>
        <a href="https://x.com/kuzzken" target="_blank" rel="noopener noreferrer">
          @kuzzken
        </a>
      </footer>
    </div>
  );
}

// ── 完成したブリーフを段階的に立ち上げる ──
function RichBrief({ doc }: { doc: BriefDoc }) {
  const md = toMarkdown(doc);
  // 立ち上がる順番（タイトル→サマリー→各セクション→決定事項）
  let order = 0;
  const delay = () => ({ animationDelay: `${0.12 + order++ * 0.11}s` } as const);

  return (
    <div className="card brief-doc">
      <div className="brief-reveal">
        <p className="brief-eyebrow" style={delay()}>
          Brief Complete ── 解像度が上がりました
        </p>
        <h2 className="brief-title" style={delay()}>
          {doc.title}
        </h2>
        {doc.summary && (
          <p className="brief-summary" style={delay()}>
            {doc.summary}
          </p>
        )}

        <div className="brief-rule" style={delay()} />

        {doc.sections.map((s, i) => (
          <section className="brief-section" key={i} style={delay()}>
            <h3 className="sec-label">{s.label}</h3>
            <Body text={s.body} />
          </section>
        ))}

        {doc.decisions.length > 0 && (
          <section className="brief-section" style={delay()}>
            <h3 className="sec-label">決定事項</h3>
            <dl className="decisions">
              {doc.decisions.map((d, i) => (
                <div className="dec-row" key={i}>
                  <dt>{d.key}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="brief-actions row" style={delay()}>
          <button onClick={() => navigator.clipboard.writeText(md)}>コピー</button>
          <button onClick={() => download(md)}>.md保存</button>
          <span className="spacer" />
          <button className="primary" onClick={() => location.reload()}>
            もう一件やる
          </button>
        </div>
      </div>
    </div>
  );
}

// 本文を段落と箇条書きに分けて描画
function Body({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: { type: "p" | "ul"; items: string[] }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isLi = line.startsWith("- ") || line.startsWith("・");
    const content = isLi ? line.replace(/^(-\s|・)/, "") : line;
    const last = blocks[blocks.length - 1];
    if (isLi) {
      if (last?.type === "ul") last.items.push(content);
      else blocks.push({ type: "ul", items: [content] });
    } else {
      blocks.push({ type: "p", items: [content] });
    }
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.items[0]}</p>
        ),
      )}
    </>
  );
}

function toMarkdown(d: BriefDoc): string {
  let s = `# ${d.title}\n\n${d.summary}\n`;
  for (const sec of d.sections) s += `\n## ${sec.label}\n\n${sec.body}\n`;
  if (d.decisions.length) {
    s += `\n## 決定事項\n\n| 項目 | 内容 |\n| --- | --- |\n`;
    for (const dec of d.decisions)
      s += `| ${dec.key} | ${dec.value.replace(/\n/g, " ")} |\n`;
  }
  return s;
}

// ── 細い円が回る、静かなローディング（baku89風）──
function Loader() {
  return (
    <div className="ring" aria-label="読み込み中">
      <svg viewBox="0 0 80 80">
        <circle className="ring-track" cx="40" cy="40" r="34" />
        <circle className="ring-arc" cx="40" cy="40" r="34" />
      </svg>
      <span className="ring-core" />
    </div>
  );
}

function download(text: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "brief.md";
  a.click();
  URL.revokeObjectURL(url);
}
