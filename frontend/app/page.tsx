"use client";

import { FormEvent, useEffect, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { BarChart3, Check, ChevronDown, Code2, Database, Files, FileWarning, Filter, Plus, Send, Upload, Users } from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { Response } from "@/components/ui/response";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Answer, LocationChart as LocationChartData, Profile, ProgressEvent, chat, upload } from "@/lib/api";

type Turn = { role: "user" | "assistant"; text: string; detail?: Answer; process?: ProgressEvent[] };

function ProcessTimeline({ steps, live = false }: { steps: ProgressEvent[]; live?: boolean }) {
  return <Collapsible.Root className="process-timeline" defaultOpen={live}>
    <Collapsible.Trigger className="process-title"><span><Code2 size={14}/> {live ? "Live analysis loop" : "Analysis process"}</span><span className="process-toggle">Details <ChevronDown size={14}/></span></Collapsible.Trigger>
    <Collapsible.Content>{steps.map((step, index) => { const active = live && index === steps.length - 1 && step.status === "active"; const status = step.status === "active" && !active ? "complete" : step.status; return <div className="process-step" data-status={status} key={`${step.stage}-${index}`}><i/><div><b>{active ? <ShimmeringText text={step.stage}/> : step.stage}</b>{step.attempt && <small>Attempt {step.attempt} of 3</small>}<p>{step.detail}</p></div></div>; })}</Collapsible.Content>
  </Collapsible.Root>;
}

function Evidence({ detail }: { detail: Answer }) {
  return <Collapsible.Root className="evidence-root"><Collapsible.Trigger className="evidence-trigger"><Code2 size={14} /> Show analysis evidence <ChevronDown size={14} /></Collapsible.Trigger><Collapsible.Content className="evidence">
    <div className="evidence-grid"><div><span><Database size={13}/> Method</span><p>{detail.method}</p></div><div><span><BarChart3 size={13}/> Sample &amp; coverage</span><p>{detail.sample_size == null ? "Sample not applicable" : `n=${detail.sample_size.toLocaleString()}`} · {detail.coverage}</p></div><div><span><Filter size={13}/> Filters</span><ul>{detail.filters.length ? detail.filters.map(x => <li key={x}>{x}</li>) : <li>None</li>}</ul></div><div><span><Check size={13}/> Definitions</span><ul>{detail.metric_definitions.length ? detail.metric_definitions.map(x => <li key={x}>{x}</li>) : <li>No special definitions</li>}</ul></div></div>
    {detail.executed_code.map((code, i) => <div key={i}><small>Executed Pandas code</small><pre><code>{code}</code></pre></div>)}
    {detail.execution_evidence.length > 0 && <div className="tool-output"><small>Compact execution output</small>{detail.execution_evidence.map((x, i) => <p key={i}>{x}</p>)}</div>}
    {detail.daily_usage && <p className="usage-note">PitchQuery usage today: {detail.daily_usage.tokens.toLocaleString()} / {detail.daily_usage.limit.toLocaleString()} reported tokens</p>}
  </Collapsible.Content></Collapsible.Root>;
}

function StrikeZone({ chart }: { chart: LocationChartData }) {
  const series = [...new Set(chart.points.map(point => point.series))]; const [hidden, setHidden] = useState<string[]>([]);
  const colors = ["#c7f55b", "#5bbcff", "#ffad5b", "#ef7197", "#a78bfa", "#58d6b0", "#f1dc62", "#d7dde0"];
  const left = 54, top = 24, width = 442, height = 354;
  const x = (value: number) => left + (value + 2.5) / 5 * width; const y = (value: number) => top + (5 - value) / 5 * height;
  const plotted = chart.points.filter(point => point.plate_x >= -2.5 && point.plate_x <= 2.5 && point.plate_z >= 0 && point.plate_z <= 5);
  const legendTitle = chart.legend_title.replace("TaggedPitchType", "Pitch type").replace("AutoPitchType", "Pitch type").replace("PitchCall", "Pitch outcome");
  function toggle(name: string) { setHidden(items => items.includes(name) ? items.filter(item => item !== name) : [...items, name]); }
  return <section className="strike-chart"><div className="strike-chart-head"><div><span>LOCATION MAP</span><h3>{chart.title}</h3></div><small>{plotted.length} plotted pitches</small></div>
    <svg className="strike-zone" viewBox="0 0 520 430" role="img" aria-label={`${chart.title}. ${plotted.length} pitch locations.`}><title>{chart.title}</title><desc>Pitch locations relative to a reference strike zone. Horizontal location is in feet and height is in feet.</desc>
      <rect className="zone-frame" x={left} y={top} width={width} height={height}/>
      {[1,2,3,4].map(tick => <g className="zone-axis" key={`y-${tick}`}><line x1={left} x2={left + width} y1={y(tick)} y2={y(tick)}/><text x={left - 10} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
      {[-2,-1,0,1,2].map(tick => <g className="zone-axis" key={`x-${tick}`}><line x1={x(tick)} x2={x(tick)} y1={top} y2={top + height}/><text x={x(tick)} y={top + height + 20} textAnchor="middle">{tick}</text></g>)}
      <rect className="zone-box" x={x(-.83)} y={y(3.5)} width={x(.83)-x(-.83)} height={y(1.5)-y(3.5)}/>
      <text className="zone-label" x={x(0)} y={y(3.5)-8} textAnchor="middle">REFERENCE ZONE</text>
      {[-.277,.277].map(value => <line className="zone-cell" key={`zx-${value}`} x1={x(value)} x2={x(value)} y1={y(3.5)} y2={y(1.5)}/>)}
      {[2.167,2.833].map(value => <line className="zone-cell" key={`zy-${value}`} x1={x(-.83)} x2={x(.83)} y1={y(value)} y2={y(value)}/>)}
      <path className="home-plate" d={`M ${x(-.38)} ${y(.3)} L ${x(.38)} ${y(.3)} L ${x(.48)} ${y(.12)} L ${x(0)} ${y(0)} L ${x(-.48)} ${y(.12)} Z`}/>
      {plotted.filter(point => !hidden.includes(point.series)).map((point, index) => <circle className="pitch-dot" key={index} cx={x(point.plate_x)} cy={y(point.plate_z)} r="4.2" fill={colors[series.indexOf(point.series) % colors.length]}><title>{point.series}{point.label ? ` · ${point.label}` : ""} · x {point.plate_x.toFixed(2)}, z {point.plate_z.toFixed(2)}</title></circle>)}
      <text className="axis-label" x={left + width / 2} y="425" textAnchor="middle">Horizontal plate location (ft)</text><text className="axis-label" transform={`translate(14 ${top + height / 2}) rotate(-90)`} textAnchor="middle">Height (ft)</text>
    </svg>
    <div className="zone-legend"><span>{legendTitle}</span>{series.map((name, index) => <button type="button" aria-pressed={!hidden.includes(name)} key={name} onClick={() => toggle(name)}><i style={{background:colors[index % colors.length]}}/>{name}</button>)}</div>
  </section>;
}

function Roster({ profile }: { profile: Profile }) {
  const pitchers = profile.pitcher_names; const batters = profile.batter_names;
  const list = (names: string[], teams: Record<string, string[]>) => <div className="roster-list">{names.map(name => <span key={name}><b>{name}</b>{teams[name]?.length ? <small>{teams[name].map(team => team.replace("T_", "")).join(" / ")}</small> : null}</span>)}</div>;
  if (!pitchers.length && !batters.length) return null;
  return <Collapsible.Root className="disclosure-root"><Collapsible.Trigger className="disclosure-trigger"><span><Users size={14}/> Roster</span><small>{pitchers.length} P / {batters.length} B</small><ChevronDown size={14}/></Collapsible.Trigger><Collapsible.Content className="roster-grid"><div><b>Pitchers</b>{list(pitchers, profile.pitcher_teams)}</div><div><b>Batters</b>{list(batters, profile.batter_teams)}</div></Collapsible.Content></Collapsible.Root>;
}

function GameFiles({ profile }: { profile: Profile }) {
  return <Collapsible.Root className="disclosure-root"><Collapsible.Trigger className="disclosure-trigger"><span><Files size={14}/> Game files</span><small>{profile.source_files.length} loaded</small><ChevronDown size={14}/></Collapsible.Trigger><Collapsible.Content className="file-list">{profile.source_files.map((file, i) => <div key={file}><i>{String(i + 1).padStart(2, "0")}</i><span>{file}</span></div>)}</Collapsible.Content></Collapsible.Root>;
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
  const pitcher = dataset?.profile.pitcher_aliases["1000036206"] ?? dataset?.profile.pitcher_names[0] ?? "pitcher 1000036206";
  const batter = dataset?.profile.batter_aliases["8886045"] ?? dataset?.profile.batter_names[0] ?? "batter 8886045";
  const examples = [
    ["0–2 pitch map", `Show ${pitcher}'s pitch locations in 0-2 counts, colored by pitch type.`],
    ["Whiff locations", `Where does ${pitcher} get swings and misses? Render the strike zone and color by pitch type.`],
    ["Contact locations", `Show where pitches to ${batter} were put in play, colored by pitch outcome.`]
  ];

  return <main>
    <header><div className="brand">PQ</div><div><h1>PitchQuery</h1><p>TrackMan scouting workspace</p></div><span className="trust-badge"><Check size={13}/> Executed evidence</span></header>
    <section className="data-card">
      <div className="data-intro"><span className="eyebrow"><Database size={14}/> ACTIVE DATASET</span><h2>{dataset?.profile.file_name ?? "Load pitch data"}</h2><p className="muted">One CSV, a folder of games, or the bundled TrackMan V3 demo.</p></div>
      <div className="actions"><label className="button secondary"><Upload size={16}/> Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files?.[0] && choose([e.target.files[0]])}/></label><label className="button secondary"><Upload size={16}/> Upload folder<input type="file" accept=".csv,text/csv" multiple hidden {...({webkitdirectory: "", directory: ""} as Record<string, string>)} onChange={e => chooseFolder(e.target.files)}/></label><button onClick={() => choose()} disabled={busy}>Use demo data</button></div>
      {dataset && <><div className="stats"><span><b>{dataset.profile.games.toLocaleString()}</b> games</span><span><b>{dataset.profile.rows.toLocaleString()}</b> pitches</span><span><b>{dataset.profile.pitchers ?? "—"}</b> pitchers</span><span><b>{dataset.profile.batters ?? "—"}</b> batters</span></div><div className="dataset-notice"><FileWarning size={15}/><span>{Object.keys(dataset.profile.pitcher_aliases).length ? "Names are stable fictional aliases; source player IDs remain attached to every pitch." : "Roster names come directly from the uploaded pitch files."}</span></div><div className="dataset-explorers"><GameFiles profile={dataset.profile}/><Roster profile={dataset.profile}/></div></>}
    </section>
    <section className="chat-card"><div className="chat-head"><div><span className="eyebrow">SCOUTING CONSOLE</span><h2>Interrogate the pitch data.</h2></div>{dataset && <div className="chat-tools"><span className="ready"><i/> Dataset ready</span><button className="new-chat" onClick={reset}><Plus size={14}/> New thread</button></div>}</div>
      <Conversation className="conversation"><ConversationContent className="conversation-content">
        {!turns.length ? <ConversationEmptyState title={dataset ? "What do you want to know?" : "Load a CSV to begin"} description={dataset ? "Try a count, sequence, usage, location, or velocity question." : "PitchQuery profiles the file before allowing analysis."}><div className="examples">{examples.map(([label, question]) => <button key={label} onClick={() => ask(question)} disabled={!dataset}><b>{label}</b><span>{question}</span></button>)}</div></ConversationEmptyState> : turns.map((turn, i) => <Message from={turn.role} key={i}><MessageContent variant={turn.role === "assistant" ? "flat" : "contained"}>
          {turn.role === "assistant" ? <><Response>{turn.text}</Response>{turn.detail?.location_chart && <StrikeZone chart={turn.detail.location_chart} />}{turn.process?.length ? <ProcessTimeline steps={turn.process}/>: null}{turn.detail && <Evidence detail={turn.detail}/>}</> : turn.text}
        </MessageContent></Message>)}
        {busy && dataset && <Message from="assistant"><MessageContent variant="flat">{process.length ? <ProcessTimeline steps={process} live/> : <div className="progress"><i/><div><ShimmeringText text="Starting the analysis loop"/><small>Waiting for the first backend event.</small></div></div>}</MessageContent></Message>}
      </ConversationContent><ConversationScrollButton /></Conversation>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit}><input aria-label="Question" value={input} onChange={e => setInput(e.target.value)} placeholder={dataset ? "Ask about counts, sequences, movement, location…" : "Load a dataset to begin"} disabled={!dataset || busy}/><button aria-label="Send" disabled={!dataset || busy || !input.trim()}><Send size={18}/></button></form>
    </section>
    <footer>PITCHQUERY / TRACKMAN SCOUTING / EXECUTED PANDAS EVIDENCE</footer>
  </main>;
}
