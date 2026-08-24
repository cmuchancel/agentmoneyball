"use client";

import { FormEvent, useEffect, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { BarChart3, Check, ChevronDown, Code2, Database, FileWarning, Filter, Send, Upload } from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { Response } from "@/components/ui/response";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Answer, Profile, ProgressEvent, chat, upload } from "@/lib/api";

type Turn = { role: "user" | "assistant"; text: string; detail?: Answer; process?: ProgressEvent[] };
const examples = [
  ["0–2 slider usage", "For pitcher 1000036206, what percentage of pitches in 0-2 counts are sliders?"],
  ["Next-pitch sequence", "After pitcher 1000036206 throws a fastball for a called strike, what comes next, split by batter handedness?"],
  ["Test a limitation", "How does pitcher 1000036206 perform with runners on first and third while trailing by one run?"]
];

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return <div className="result-block"><div className="result-title"><BarChart3 size={15} /> Result table</div><div className="table-wrap"><table><thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{columns.map(c => <td key={c}>{String(row[c] ?? "—")}</td>)}</tr>)}</tbody></table></div></div>;
}

function ProcessTimeline({ steps, live = false }: { steps: ProgressEvent[]; live?: boolean }) {
  return <div className="process-timeline"><div className="process-title"><Code2 size={14}/> {live ? "Live analysis loop" : "Analysis process"}</div>
    {steps.map((step, index) => { const active = live && index === steps.length - 1 && step.status === "active"; const status = step.status === "active" && !active ? "complete" : step.status; return <div className="process-step" data-status={status} key={`${step.stage}-${index}`}><i/><div><b>{active ? <ShimmeringText text={step.stage}/> : step.stage}</b>{step.attempt && <small>Attempt {step.attempt} of 3</small>}<p>{step.detail}</p></div></div>; })}
  </div>;
}

function Evidence({ detail }: { detail: Answer }) {
  return <Collapsible.Root className="evidence-root"><Collapsible.Trigger className="evidence-trigger"><Code2 size={14} /> Show analysis evidence <ChevronDown size={14} /></Collapsible.Trigger><Collapsible.Content className="evidence">
    <div className="evidence-grid"><div><span><Filter size={13}/> Filters</span><ul>{detail.filters.length ? detail.filters.map(x => <li key={x}>{x}</li>) : <li>None</li>}</ul></div><div><span><Check size={13}/> Definitions</span><ul>{detail.metric_definitions.length ? detail.metric_definitions.map(x => <li key={x}>{x}</li>) : <li>No special definitions</li>}</ul></div></div>
    {detail.executed_code.map((code, i) => <div key={i}><small>Executed Pandas code</small><pre><code>{code}</code></pre></div>)}
    {detail.execution_evidence.length > 0 && <div className="tool-output"><small>Compact execution output</small>{detail.execution_evidence.map((x, i) => <p key={i}>{x}</p>)}</div>}
    {detail.daily_usage && <p className="usage-note">PitchQuery usage today: {detail.daily_usage.tokens.toLocaleString()} / {detail.daily_usage.limit.toLocaleString()} reported tokens</p>}
  </Collapsible.Content></Collapsible.Root>;
}

export default function Home() {
  const [dataset, setDataset] = useState<{dataset_id: string; profile: Profile}>(); const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [process, setProcess] = useState<ProgressEvent[]>([]); const [error, setError] = useState(""); const [thread, setThread] = useState("");
  useEffect(() => { const id = sessionStorage.getItem("pitchquery-thread") ?? crypto.randomUUID(); sessionStorage.setItem("pitchquery-thread", id); setThread(id); }, []);

  async function choose(files?: File[]) {
    setBusy(true); setProcess([]); setError("");
    try { setDataset(await upload(files)); setTurns([]); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  async function ask(text: string) {
    if (!dataset || !text.trim() || busy) return;
    const trace: ProgressEvent[] = [];
    setTurns(t => [...t, {role: "user", text}]); setInput(""); setBusy(true); setError(""); setProcess([]);
    try { const detail = await chat(thread, dataset.dataset_id, text, event => { trace.push(event); setProcess([...trace]); }); setTurns(t => [...t, {role: "assistant", text: detail.answer, detail, process: [...trace]}]); }
    catch (e) { setError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setBusy(false); setProcess([]); }
  }
  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }
  function reset() { const id = crypto.randomUUID(); sessionStorage.setItem("pitchquery-thread", id); setThread(id); setTurns([]); }
  function chooseFolder(list: FileList | null) {
    const files = Array.from(list ?? []).filter(file => file.name.toLowerCase().endsWith(".csv"));
    if (files.length) void choose(files); else setError("The selected folder contains no CSV files.");
  }

  return <main>
    <header><div className="brand">PQ</div><div><h1>PitchQuery</h1><p>Every pitch. Any question answerable from your data.</p></div><span className="trust-badge"><Check size={13}/> Evidence-gated</span></header>
    <section className="data-card">
      <div><span className="eyebrow"><Database size={14}/> DATA SOURCE</span><h2>{dataset?.profile.file_name ?? "Load pitch data"}</h2><p className="muted">Upload one TrackMan CSV, a folder of game CSVs, or explore the public V3 dataset.</p></div>
      <div className="actions"><label className="button secondary"><Upload size={16}/> Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files?.[0] && choose([e.target.files[0]])}/></label><label className="button secondary"><Upload size={16}/> Upload folder<input type="file" accept=".csv,text/csv" multiple hidden {...({webkitdirectory: "", directory: ""} as Record<string, string>)} onChange={e => chooseFolder(e.target.files)}/></label><button onClick={() => choose()} disabled={busy}>Use demo data</button></div>
      {dataset && <><div className="stats"><span><b>{dataset.profile.rows.toLocaleString()}</b> pitches</span><span><b>{dataset.profile.columns}</b> fields</span><span><b>{dataset.profile.pitchers ?? "—"}</b> pitchers</span><span><b>{dataset.profile.batters ?? "—"}</b> batters</span><span><b>{dataset.profile.date_coverage ?? "—"}</b> coverage</span><button className="link" onClick={reset}>Start new conversation</button></div><div className="dataset-notice"><FileWarning size={15}/><span>The bundled research dataset contains anonymized players and dates. Answers can only use fields present in the loaded file.</span></div></>}
    </section>
    <section className="chat-card"><div className="chat-head"><div><span className="eyebrow">SCOUTING CONVERSATION</span><h2>Ask the pitch data.</h2></div>{dataset && <span className="ready"><i/> Dataset ready</span>}</div>
      <Conversation className="conversation"><ConversationContent className="conversation-content">
        {!turns.length ? <ConversationEmptyState title={dataset ? "What do you want to know?" : "Load a CSV to begin"} description={dataset ? "Try a count, sequence, usage, location, or velocity question." : "PitchQuery profiles the file before allowing analysis."}><div className="examples">{examples.map(([label, question]) => <button key={label} onClick={() => ask(question)} disabled={!dataset}><b>{label}</b><span>{question}</span></button>)}</div></ConversationEmptyState> : turns.map((turn, i) => <Message from={turn.role} key={i}><MessageContent variant={turn.role === "assistant" ? "flat" : "contained"}>
          {turn.role === "assistant" ? <><Response>{turn.text}</Response>{turn.process?.length ? <ProcessTimeline steps={turn.process}/>: null}{turn.detail?.result_table?.length ? <ResultTable rows={turn.detail.result_table}/>: null}{turn.detail?.chart_file && <div className="result-block"><div className="result-title"><BarChart3 size={15}/> Generated chart</div><img className="chart" src={turn.detail.chart_file} alt="Generated analysis chart" /></div>}{turn.detail && <Evidence detail={turn.detail}/>}</> : turn.text}
        </MessageContent></Message>)}
        {busy && dataset && <Message from="assistant"><MessageContent variant="flat">{process.length ? <ProcessTimeline steps={process} live/> : <div className="progress"><i/><div><ShimmeringText text="Starting the analysis loop"/><small>Waiting for the first backend event.</small></div></div>}</MessageContent></Message>}
      </ConversationContent><ConversationScrollButton /></Conversation>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit}><input aria-label="Question" value={input} onChange={e => setInput(e.target.value)} placeholder={dataset ? "Ask about counts, sequences, movement, location…" : "Load a dataset to begin"} disabled={!dataset || busy}/><button aria-label="Send" disabled={!dataset || busy || !input.trim()}><Send size={18}/></button></form>
    </section>
    <footer>Numerical answers come from successfully executed Pandas code · No ElevenLabs Agent ID or voice connection</footer>
  </main>;
}
