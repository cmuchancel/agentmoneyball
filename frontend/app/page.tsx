"use client";

import { FormEvent, useEffect, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Database, Send, Upload } from "lucide-react";
import { Conversation, ConversationContent } from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { Response } from "@/components/ui/response";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Answer, Profile, chat, upload } from "@/lib/api";

type Turn = {role: "user" | "assistant"; text: string; detail?: Answer};
const examples = [
  "For pitcher 1000036206, what percentage of pitches in 0-2 counts are sliders?",
  "After pitcher 1000036206 throws a fastball for a called strike, what comes next, split by batter handedness?",
  "How does pitcher 1000036206 perform with runners on first and third while trailing by one run?"
];

export default function Home() {
  const [dataset, setDataset] = useState<{dataset_id: string; profile: Profile}>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thread, setThread] = useState("");
  useEffect(() => {
    const id = sessionStorage.getItem("pitchquery-thread") ?? crypto.randomUUID();
    sessionStorage.setItem("pitchquery-thread", id); setThread(id);
  }, []);

  async function choose(file?: File) {
    setBusy(true); setError("");
    try { setDataset(await upload(file)); setTurns([]); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function ask(text: string) {
    if (!dataset || !text.trim() || busy) return;
    setTurns(t => [...t, {role: "user", text}]); setInput(""); setBusy(true); setError("");
    try { const detail = await chat(thread, dataset.dataset_id, text); setTurns(t => [...t, {role: "assistant", text: detail.answer, detail}]); }
    catch (e) { setError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setBusy(false); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }
  function reset() { const id = crypto.randomUUID(); sessionStorage.setItem("pitchquery-thread", id); setThread(id); setTurns([]); }

  return <main>
    <header><div className="brand">PQ</div><div><h1>PitchQuery</h1><p>Every pitch. Any question answerable from your data.</p></div></header>
    <section className="data-card">
      <div><span className="eyebrow"><Database size={14}/> DATA SOURCE</span><h2>{dataset?.profile.file_name ?? "Load pitch data"}</h2>
        <p className="muted">Upload a TrackMan-style CSV or explore a synthetic, anonymized fixture.</p></div>
      <div className="actions"><label className="button secondary"><Upload size={16}/> Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files?.[0] && choose(e.target.files[0])}/></label>
        <button onClick={() => choose()} disabled={busy}>Use demo data</button></div>
      {dataset && <div className="stats"><span><b>{dataset.profile.rows.toLocaleString()}</b> pitches</span><span><b>{dataset.profile.columns}</b> fields</span><span><b>{dataset.profile.pitchers ?? "—"}</b> pitchers</span><span><b>{dataset.profile.batters ?? "—"}</b> batters</span><button className="link" onClick={reset}>Start new conversation</button></div>}
    </section>
    <section className="chat-card"><div className="chat-head"><span className="eyebrow">SCOUTING CONVERSATION</span><h2>Ask the pitch data.</h2></div>
      {!turns.length && <div className="examples">{examples.map(x => <button key={x} onClick={() => ask(x)} disabled={!dataset}>{x}</button>)}</div>}
      <Conversation><ConversationContent>{turns.map((turn, i) => <Message className={turn.role} key={i}><MessageContent>
        {turn.role === "assistant" ? <><Response>{turn.text}</Response>{turn.detail && <Collapsible.Root><Collapsible.Trigger className="evidence-trigger">Show analysis evidence <ChevronDown size={14}/></Collapsible.Trigger><Collapsible.Content className="evidence">
          {turn.detail.executed_code.map((code, j) => <pre key={j}><code>{code}</code></pre>)}
          {turn.detail.execution_evidence.map((x, j) => <p key={j}>{x}</p>)}
        </Collapsible.Content></Collapsible.Root>}</> : turn.text}
      </MessageContent></Message>)}</ConversationContent></Conversation>
      {busy && <div className="working"><ShimmeringText text={dataset ? "Running Pandas and checking evidence…" : "Profiling dataset…"}/></div>}
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit}><input aria-label="Question" value={input} onChange={e => setInput(e.target.value)} placeholder={dataset ? "Ask about counts, sequences, movement, location…" : "Load a dataset to begin"} disabled={!dataset || busy}/><button aria-label="Send" disabled={!dataset || busy || !input.trim()}><Send size={18}/></button></form>
    </section>
    <footer>Numerical answers are derived from executed Pandas code. Uploaded data may be incomplete.</footer>
  </main>;
}

