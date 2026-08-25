"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight, Code2, Database, Download,
  FileBarChart, Files, FileText, FileWarning, Filter, FolderOpen, GripVertical, PanelRight,
  RefreshCw, Save, Send, Table2, Upload, Users, X,
} from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { Response } from "@/components/ui/response";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { Answer, LocationChart as LocationChartData, Profile, ProgressEvent, chat, upload } from "@/lib/api";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  question?: string;
  detail?: Answer;
  process?: ProgressEvent[];
};

type Artifact = {
  id: string;
  turnId: string;
  title: string;
  kind: "location" | "table" | "metrics";
  detail: Answer;
};

type ReportTemplate = { id: string; name: string; recipes: string[] };

const TEMPLATE_KEY = "pitchquery-report-templates";
const colors = ["#37a7ff", "#ff9418", "#74c82b", "#f45555", "#a57aff", "#3fd0b2", "#f1d45d", "#d7dde0"];

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, letter => letter.toUpperCase());
}

function artifactFrom(turn: Turn): Artifact | undefined {
  const detail = turn.detail;
  if (!detail) return;
  const kind = detail.location_chart ? "location" : detail.result_table?.length ? "table" : detail.metrics?.length ? "metrics" : undefined;
  if (!kind) return;
  const title = detail.location_chart?.title || detail.question_interpreted || turn.question || "Scouting analysis";
  return { id: `artifact-${turn.id}`, turnId: turn.id, title, kind, detail };
}

function ProcessTimeline({ steps, live = false }: { steps: ProgressEvent[]; live?: boolean }) {
  return <Collapsible.Root className="process-timeline" defaultOpen={live}>
    <Collapsible.Trigger className="process-title">
      <span><Code2 size={13}/> {live ? "Live analysis" : "Analysis process"}</span>
      <span className="process-toggle">Details <ChevronDown size={13}/></span>
    </Collapsible.Trigger>
    <Collapsible.Content>{steps.map((step, index) => {
      const active = live && index === steps.length - 1 && step.status === "active";
      const status = step.status === "active" && !active ? "complete" : step.status;
      return <div className="process-step" data-status={status} key={`${step.stage}-${index}`}><i/><div>
        <b>{active ? <ShimmeringText text={step.stage}/> : step.stage}</b>
        {step.attempt && <small>Attempt {step.attempt} of 3</small>}<p>{step.detail}</p>
      </div></div>;
    })}</Collapsible.Content>
  </Collapsible.Root>;
}

function Evidence({ detail }: { detail: Answer }) {
  return <Collapsible.Root className="evidence-root">
    <Collapsible.Trigger className="evidence-trigger"><Code2 size={13}/> Method + evidence <ChevronDown size={13}/></Collapsible.Trigger>
    <Collapsible.Content className="evidence">
      <div className="evidence-grid">
        <div><span><Database size={12}/> Method</span><p>{detail.method}</p></div>
        <div><span><BarChart3 size={12}/> Coverage</span><p>{detail.sample_size == null ? "Sample not applicable" : `n=${detail.sample_size.toLocaleString()}`} · {detail.coverage}</p></div>
        <div><span><Filter size={12}/> Filters</span><ul>{detail.filters.length ? detail.filters.map(item => <li key={item}>{item}</li>) : <li>None</li>}</ul></div>
        <div><span><Check size={12}/> Definitions</span><ul>{detail.metric_definitions.length ? detail.metric_definitions.map(item => <li key={item}>{item}</li>) : <li>No special definitions</li>}</ul></div>
      </div>
      {detail.tools_used?.length ? <div className="tool-output"><small>Verified data tools</small><p>{detail.tools_used.join(" · ")}</p></div> : null}
      {detail.executed_code.map((code, index) => <div key={index}><small>Executed Pandas code</small><pre><code>{code}</code></pre></div>)}
      {detail.execution_evidence.length > 0 && <div className="tool-output"><small>Execution output</small>{detail.execution_evidence.map((item, index) => <p key={index}>{item}</p>)}</div>}
      {detail.warnings.length > 0 && <div className="artifact-warning"><FileWarning size={13}/>{detail.warnings.join(" ")}</div>}
    </Collapsible.Content>
  </Collapsible.Root>;
}

function Shape({ index, cx, cy, size, fill }: { index: number; cx: number; cy: number; size: number; fill: string }) {
  const points = index % 6 === 2 ? `${cx},${cy-size} ${cx+size},${cy+size} ${cx-size},${cy+size}`
    : index % 6 === 3 ? `${cx},${cy-size} ${cx+size},${cy} ${cx},${cy+size} ${cx-size},${cy}`
    : index % 6 === 4 ? `${cx-size},${cy-size} ${cx+size},${cy-size} ${cx},${cy+size}`
    : `${cx-size},${cy} ${cx-size/2},${cy-size*.86} ${cx+size/2},${cy-size*.86} ${cx+size},${cy} ${cx+size/2},${cy+size*.86} ${cx-size/2},${cy+size*.86}`;
  if (index % 6 === 0) return <circle className="pitch-symbol" cx={cx} cy={cy} r={size} fill={fill}/>;
  if (index % 6 === 1) return <rect className="pitch-symbol" x={cx-size} y={cy-size} width={size*2} height={size*2} fill={fill}/>;
  return <polygon className="pitch-symbol" points={points} fill={fill}/>;
}

function StrikeZone({ chart, compact = false }: { chart: LocationChartData; compact?: boolean }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const left = 54, top = 24, width = 442, height = 354;
  const plotted = chart.points.filter(point => Number.isFinite(point.plate_x) && Number.isFinite(point.plate_z));
  const xMin = Math.min(-2.5, Math.floor(Math.min(...plotted.map(point => point.plate_x)) * 2) / 2);
  const xMax = Math.max(2.5, Math.ceil(Math.max(...plotted.map(point => point.plate_x)) * 2) / 2);
  const zMin = Math.min(0, Math.floor(Math.min(...plotted.map(point => point.plate_z)) * 2) / 2);
  const zMax = Math.max(5, Math.ceil(Math.max(...plotted.map(point => point.plate_z)) * 2) / 2);
  const x = (value: number) => left + (value - xMin) / (xMax - xMin) * width;
  const y = (value: number) => top + (zMax - value) / (zMax - zMin) * height;
  const ticks = (min: number, max: number) => Array.from({length: 6}, (_, index) => min + (max - min) * index / 5);
  const value = (point: LocationChartData["points"][number], feature: string) => point.features.find(item => item.name === feature)?.value ?? "Unclassified";
  const categories = (feature: string) => [...new Set(plotted.map(point => value(point, feature)))];
  const colorEncoding = chart.encodings.find(item => item.channel === "color");
  const shapeEncoding = chart.encodings.find(item => item.channel === "shape");
  const key = (feature: string, category: string) => `${feature}:${category}`;
  const visible = (point: LocationChartData["points"][number]) => !chart.encodings.some(encoding => hidden.includes(key(encoding.feature, value(point, encoding.feature))));
  function toggle(feature: string, category: string) {
    const item = key(feature, category);
    setHidden(items => items.includes(item) ? items.filter(current => current !== item) : [...items, item]);
  }
  return <section className={`strike-chart ${compact ? "compact" : ""}`}>
    {!compact && <div className="strike-chart-head"><div><span>LOCATION MAP / CATCHER VIEW</span><h3>{chart.title}</h3></div><small>{plotted.length} plotted pitches</small></div>}
    <svg className="strike-zone" viewBox="0 0 520 430" role="img" aria-label={`${chart.title}. ${plotted.length} pitch locations.`}>
      <title>{chart.title}</title><rect className="zone-frame" x={left} y={top} width={width} height={height}/>
      {ticks(zMin, zMax).map(tick => <g className="zone-axis" key={`y-${tick}`}><line x1={left} x2={left+width} y1={y(tick)} y2={y(tick)}/>{!compact && <text x={left-10} y={y(tick)+4} textAnchor="end">{tick.toFixed(tick % 1 ? 1 : 0)}</text>}</g>)}
      {ticks(xMin, xMax).map(tick => <g className="zone-axis" key={`x-${tick}`}><line x1={x(tick)} x2={x(tick)} y1={top} y2={top+height}/>{!compact && <text x={x(tick)} y={top+height+20} textAnchor="middle">{tick.toFixed(tick % 1 ? 1 : 0)}</text>}</g>)}
      <rect className="zone-box" x={x(-.83)} y={y(3.5)} width={x(.83)-x(-.83)} height={y(1.5)-y(3.5)}/>
      {[-.277,.277].map(item => <line className="zone-cell" key={`zx-${item}`} x1={x(item)} x2={x(item)} y1={y(3.5)} y2={y(1.5)}/>)}
      {[2.167,2.833].map(item => <line className="zone-cell" key={`zy-${item}`} x1={x(-.83)} x2={x(.83)} y1={y(item)} y2={y(item)}/>)}
      <path className="home-plate" d={`M ${x(-.38)} ${y(.3)} L ${x(.38)} ${y(.3)} L ${x(.48)} ${y(.12)} L ${x(0)} ${y(0)} L ${x(-.48)} ${y(.12)} Z`}/>
      {plotted.filter(visible).map((point, index) => {
        const colorValues = colorEncoding ? categories(colorEncoding.feature) : [];
        const shapeValues = shapeEncoding ? categories(shapeEncoding.feature) : [];
        const color = colorEncoding ? colors[colorValues.indexOf(value(point, colorEncoding.feature)) % colors.length] : colors[0];
        const shape = shapeEncoding ? shapeValues.indexOf(value(point, shapeEncoding.feature)) : 0;
        return <g className="pitch-mark" key={index}><title>{point.features.map(item => `${titleCase(item.name)}: ${item.value}`).join(" · ")}</title><Shape index={shape} cx={x(point.plate_x)} cy={y(point.plate_z)} size={compact ? 5.5 : 4.5} fill={color}/></g>;
      })}
      {!compact && <><text className="axis-label" x={left+width/2} y="425" textAnchor="middle">Horizontal plate location (ft)</text><text className="axis-label" transform={`translate(14 ${top+height/2}) rotate(-90)`} textAnchor="middle">Height (ft)</text></>}
    </svg>
    {!compact && chart.encodings.map(encoding => <div className="zone-legend" key={`${encoding.channel}-${encoding.feature}`}>
      <span>{encoding.label || titleCase(encoding.feature)} · {encoding.channel}</span>
      {categories(encoding.feature).map((category, index) => <button type="button" aria-pressed={!hidden.includes(key(encoding.feature, category))} key={category} onClick={() => toggle(encoding.feature, category)}>
        {encoding.channel === "color" ? <i style={{background:colors[index % colors.length]}}/> : <svg viewBox="0 0 14 14" aria-hidden="true"><Shape index={index} cx={7} cy={7} size={4} fill="#c3cac3"/></svg>}{category}
      </button>)}
    </div>)}
  </section>;
}

function Metrics({ detail }: { detail: Answer }) {
  if (!detail.metrics?.length) return null;
  return <div className="metric-strip">{detail.metrics.slice(0, 6).map((metric, index) => <div key={`${metric.name}-${index}`}>
    <span>{metric.name}</span><b>{metric.value ?? "—"}{metric.unit === "percent" || metric.unit === "%" ? "%" : metric.unit ? ` ${metric.unit}` : ""}</b>
    {metric.numerator != null && metric.denominator != null && <small>{metric.numerator.toLocaleString()} / {metric.denominator.toLocaleString()}</small>}
  </div>)}</div>;
}

function ResultTable({ rows }: { rows?: Record<string, unknown>[] | null }) {
  if (!rows?.length) return null;
  const columns = Object.keys(rows[0]).slice(0, 8);
  return <div className="result-table-wrap"><table><thead><tr>{columns.map(column => <th key={column}>{titleCase(column)}</th>)}</tr></thead><tbody>
    {rows.slice(0, 50).map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{String(row[column] ?? "—")}</td>)}</tr>)}
  </tbody></table>{rows.length > 50 && <small>Showing 50 of {rows.length.toLocaleString()} rows.</small>}</div>;
}

function ArtifactBody({ artifact, print = false }: { artifact: Artifact; print?: boolean }) {
  const detail = artifact.detail;
  return <div className={`artifact-body ${print ? "print-artifact" : ""}`}>
    <Metrics detail={detail}/>
    {detail.location_chart && <StrikeZone chart={detail.location_chart} compact={print}/>}<ResultTable rows={detail.result_table}/>
    {!print && <Evidence detail={detail}/>}
  </div>;
}

function Roster({ profile }: { profile: Profile }) {
  const list = (names: string[], teams: Record<string, string[]>, label: string) => <div><b>{label}</b><div className="roster-list">{names.map(name => <span key={name}><strong>{name}</strong><small>{teams[name]?.map(team => team.replace("T_", "")).join(" / ")}</small></span>)}</div></div>;
  return <Collapsible.Root className="rail-disclosure"><Collapsible.Trigger><span><Users size={13}/> Roster</span><small>{profile.pitcher_names.length} P / {profile.batter_names.length} B</small><ChevronDown size={13}/></Collapsible.Trigger><Collapsible.Content className="roster-grid">
    {list(profile.pitcher_names, profile.pitcher_teams, "Pitchers")}{list(profile.batter_names, profile.batter_teams, "Batters")}
  </Collapsible.Content></Collapsible.Root>;
}

function GameFiles({ profile }: { profile: Profile }) {
  return <Collapsible.Root className="rail-disclosure" defaultOpen><Collapsible.Trigger><span><Files size={13}/> Game files</span><small>{profile.source_files.length}</small><ChevronDown size={13}/></Collapsible.Trigger><Collapsible.Content className="game-list">{profile.source_files.map((file, index) => <div key={file}><i>{String(index+1).padStart(2,"0")}</i><span>{file}</span></div>)}</Collapsible.Content></Collapsible.Root>;
}

function DataRail({ dataset, busy, choose, chooseFolder }: {
  dataset?: {dataset_id: string; profile: Profile}; busy: boolean;
  choose: (files?: File[]) => void; chooseFolder: (files: FileList | null) => void;
}) {
  const profile = dataset?.profile;
  return <aside className="data-rail"><div className="rail-label">Data explorer</div>
    <div className="upload-stack">
      <label><Upload size={14}/> Upload CSV<input type="file" accept=".csv,text/csv" hidden onChange={event => event.target.files?.[0] && choose([event.target.files[0]])}/></label>
      <label><FolderOpen size={14}/> Upload folder<input type="file" accept=".csv,text/csv" multiple hidden {...({webkitdirectory:"",directory:""} as Record<string,string>)} onChange={event => chooseFolder(event.target.files)}/></label>
      <button type="button" onClick={() => choose()} disabled={busy}><RefreshCw size={14}/> Use demo data</button>
    </div>
    {profile ? <>
      <div className="rail-stats"><span><b>{profile.games}</b>games</span><span><b>{profile.rows.toLocaleString()}</b>pitches</span><span><b>{profile.pitchers ?? "—"}</b>pitchers</span><span><b>{profile.batters ?? "—"}</b>batters</span></div>
      <GameFiles profile={profile}/><Roster profile={profile}/>
      <div className="rail-note"><FileWarning size={13}/><span>{Object.keys(profile.pitcher_aliases).length ? "Demo names are fictional aliases; source IDs remain attached." : "Roster names come from the uploaded files."}</span></div>
    </> : <div className="rail-empty"><Database size={22}/><b>No active dataset</b><span>Upload TrackMan CSV files or open the demo.</span></div>}
  </aside>;
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  return <div className="artifact-preview">
    <div className="preview-title">{artifact.kind === "location" ? <FileBarChart size={13}/> : artifact.kind === "table" ? <Table2 size={13}/> : <BarChart3 size={13}/>}<span>{artifact.title}</span></div>
    {artifact.detail.location_chart
      ? <StrikeZone chart={artifact.detail.location_chart} compact/>
      : artifact.detail.result_table?.length
        ? <ResultTable rows={artifact.detail.result_table.slice(0, 3)}/>
        : <Metrics detail={artifact.detail}/>}
  </div>;
}

function ConversationPanel({ dataset, turns, busy, process, input, error, selected, setInput, ask, openArtifact, toggleReport }: {
  dataset?: {dataset_id: string; profile: Profile}; turns: Turn[]; busy: boolean; process: ProgressEvent[]; input: string; error: string;
  selected: string[]; setInput: (value: string) => void; ask: (value: string) => void;
  openArtifact: (turn: Turn) => void; toggleReport: (turnId: string) => void;
}) {
  function submit(event: FormEvent) { event.preventDefault(); ask(input); }
  const pitcher = dataset?.profile.pitcher_aliases["1000036206"] ?? dataset?.profile.pitcher_names[0] ?? "a pitcher";
  const examples = [
    ["0–2 location map", `Show ${pitcher}'s pitch locations in 0-2 counts, colored by pitch type and shaped by pitch outcome.`],
    ["Whiff locations", `Where does ${pitcher} get swings and misses? Render the strike zone and color by pitch type.`],
    ["Pitch mix", `How does ${pitcher}'s pitch mix change by count?`],
  ];
  return <section className="conversation-panel"><div className="panel-heading"><span>Scouting conversation / 01</span><small>{turns.length ? `${Math.ceil(turns.length/2)} queries` : "Ready"}</small></div>
    <Conversation className="conversation"><ConversationContent className="conversation-content">
      {!turns.length ? <ConversationEmptyState title={dataset ? "Ask the data what matters." : "Load TrackMan data to begin."} description={dataset ? "Answers stay conversational. Charts, tables, and comparisons open beside the chat." : "Use a CSV, a folder of games, or the bundled demo."}>
        <div className="examples">{examples.map(([label, question]) => <button key={label} type="button" onClick={() => ask(question)} disabled={!dataset}><b>{label}</b><span>{question}</span></button>)}</div>
      </ConversationEmptyState> : turns.map(turn => <Message from={turn.role} key={turn.id}><MessageContent variant={turn.role === "assistant" ? "flat" : "contained"}>
        {turn.role === "assistant" ? <>
          <div className="assistant-mark"><i/> PitchQuery</div><Response>{turn.text}</Response>
          {artifactFrom(turn) && <button type="button" className="preview-button" onClick={() => openArtifact(turn)} aria-label={`Open ${artifactFrom(turn)?.title}`}><ArtifactPreview artifact={artifactFrom(turn)!}/></button>}
          <div className="response-actions">
            {artifactFrom(turn) && <button type="button" onClick={() => openArtifact(turn)}><FileBarChart size={13}/> Open artifact</button>}
            <button type="button" className={selected.includes(turn.id) ? "selected" : ""} onClick={() => toggleReport(turn.id)}><FileText size={13}/>{selected.includes(turn.id) ? "Added to report" : "Add to report"}{selected.includes(turn.id) && <Check size={12}/>}</button>
          </div>
          {turn.process?.length ? <ProcessTimeline steps={turn.process}/> : null}
        </> : turn.text}
      </MessageContent></Message>)}
      {busy && dataset && <Message from="assistant"><MessageContent variant="flat">{process.length ? <ProcessTimeline steps={process} live/> : <div className="progress"><i/><div><ShimmeringText text="Starting the analysis"/><small>Waiting for the first backend event.</small></div></div>}</MessageContent></Message>}
    </ConversationContent><ConversationScrollButton/></Conversation>
    {error && <p className="error">{error}</p>}
    <form className="chat-form" onSubmit={submit}><input aria-label="Scouting question" value={input} onChange={event => setInput(event.target.value)} placeholder={dataset ? "Ask about counts, sequences, movement, location…" : "Load a dataset to begin"} disabled={!dataset || busy}/><button aria-label="Send" disabled={!dataset || busy || !input.trim()}><Send size={17}/></button></form>
  </section>;
}

function Workspace({ artifacts, activeId, setActive, close, toggleReport, selected }: {
  artifacts: Artifact[]; activeId: string; setActive: (id: string) => void; close: (id: string) => void;
  toggleReport: (turnId: string) => void; selected: string[];
}) {
  const active = artifacts.find(artifact => artifact.id === activeId) ?? artifacts[0];
  return <section className="workspace-panel">
    {artifacts.length > 0 && <div className="artifact-tabs" role="tablist" aria-label="Chat artifacts">{artifacts.map(artifact => <button type="button" role="tab" aria-selected={artifact.id === active?.id} className={artifact.id === active?.id ? "active" : ""} key={artifact.id} onClick={() => setActive(artifact.id)}>
      {artifact.kind === "location" ? <FileBarChart size={13}/> : artifact.kind === "table" ? <Table2 size={13}/> : <BarChart3 size={13}/>}<span>{artifact.title}</span><X size={13} onClick={event => { event.stopPropagation(); close(artifact.id); }}/>
    </button>)}</div>}
    {active ? <><div className="artifact-heading"><div><span>{active.kind === "location" ? "Location analysis" : active.kind === "table" ? "Data table" : "Scouting summary"}</span><h2>{active.title}</h2></div><button type="button" className={selected.includes(active.turnId) ? "selected" : ""} onClick={() => toggleReport(active.turnId)}><FileText size={14}/>{selected.includes(active.turnId) ? "In report" : "Add to report"}</button></div><div className="artifact-scroll"><ArtifactBody artifact={active}/></div></> : <div className="workspace-empty"><div><FileBarChart size={26}/></div><span>Artifact workspace</span><h2>Charts and tables open here.</h2><p>Ask a question in the conversation. Structured results create tabs automatically—there are no empty tabs to manage.</p></div>}
  </section>;
}

function ReportComposer({ open, turns, selected, templates, templateId, templateName, player, players, busy, setOpen, setTemplateId, setTemplateName, setPlayer, remove, move, saveTemplate, runTemplate }: {
  open: boolean; turns: Turn[]; selected: string[]; templates: ReportTemplate[]; templateId: string; templateName: string; player: string; players: string[]; busy: boolean;
  setOpen: (open: boolean) => void; setTemplateId: (id: string) => void; setTemplateName: (name: string) => void; setPlayer: (name: string) => void;
  remove: (id: string) => void; move: (id: string, direction: -1 | 1) => void; saveTemplate: () => void; runTemplate: () => void;
}) {
  const items = selected.map(id => turns.find(turn => turn.id === id)).filter(Boolean) as Turn[];
  return <aside className={`report-composer ${open ? "open" : ""}`}><div className="composer-head"><div><span>Report workspace</span><h2>Report Composer</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close report composer"><X size={17}/></button></div>
    <div className="composer-scroll"><section className="composer-section"><label>Saved template</label><select value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">No template selected</option>{templates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select>
      <label>Template name</label><div className="inline-control"><input value={templateName} onChange={event => setTemplateName(event.target.value)}/><button type="button" onClick={saveTemplate} disabled={!items.length} title="Save selected questions as a reusable template"><Save size={14}/></button></div>
      <label>Player variable</label><select value={player} onChange={event => setPlayer(event.target.value)}>{players.map(name => <option key={name}>{name}</option>)}</select>
      <button type="button" className="generate-report" onClick={runTemplate} disabled={!templateId || !player || busy}><RefreshCw size={14}/> Generate selected template for player</button><p className="composer-help">Templates store the original questions as recipes and replace the player with <code>{"{{player}}"}</code>.</p>
    </section>
    <section className="composer-section"><div className="section-title"><label>Selected responses</label><small>{items.length} items</small></div>{items.length ? <div className="selected-items">{items.map((turn, index) => { const artifact = artifactFrom(turn); return <div key={turn.id}><GripVertical size={14}/><span>{artifact?.title || turn.question || "Scouting response"}</span><div><button type="button" onClick={() => move(turn.id,-1)} disabled={index===0} aria-label="Move up"><ChevronLeft size={13}/></button><button type="button" onClick={() => move(turn.id,1)} disabled={index===items.length-1} aria-label="Move down"><ChevronRight size={13}/></button><button type="button" onClick={() => remove(turn.id)} aria-label="Remove"><X size={13}/></button></div></div>; })}</div> : <div className="composer-empty">Use “Add to report” on any response.</div>}</section>
    <section className="composer-section"><div className="section-title"><label>US Letter preview</label><small>{items.length} pages</small></div><div className="page-thumbnails">{items.map((turn,index) => <div className="page-thumb" key={turn.id}><div><span>PITCHQUERY / ADVANCE REPORT</span><b>{artifactFrom(turn)?.title || turn.question}</b><i/><i/><i/></div><small>Page {index+1}</small></div>)}</div></section></div>
    <div className="composer-footer"><span>{items.length} selected · US Letter</span><button type="button" onClick={() => window.print()} disabled={!items.length}><Download size={15}/> Export PDF</button></div>
  </aside>;
}

function PrintReport({ turns, selected, player }: { turns: Turn[]; selected: string[]; player: string }) {
  const items = selected.map(id => turns.find(turn => turn.id === id)).filter(Boolean) as Turn[];
  return <div className="report-print-root">{items.map((turn,index) => { const artifact = artifactFrom(turn); return <article className="print-sheet" key={turn.id}><header><div><b>PITCHQUERY</b><span>TRACKMAN ADVANCE REPORT</span></div><small>{player || "SCOUTING REPORT"} · {index+1} / {items.length}</small></header><h1>{artifact?.title || turn.question || "Scouting analysis"}</h1><p className="print-question">{turn.question}</p><div className="print-answer">{turn.text}</div>{artifact && <ArtifactBody artifact={artifact} print/>}<footer>Generated from executed PitchQuery evidence. Verify game-planning decisions against source video and staff context.</footer></article>; })}</div>;
}

export default function Home() {
  const [dataset, setDataset] = useState<{dataset_id: string; profile: Profile}>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeId, setActiveId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [process, setProcess] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState("");
  const [thread, setThread] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("Pitcher Advance Report");
  const [player, setPlayer] = useState("");

  useEffect(() => {
    const id = sessionStorage.getItem("pitchquery-thread") ?? crypto.randomUUID();
    sessionStorage.setItem("pitchquery-thread", id); setThread(id);
    try { setTemplates(JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "[]")); } catch { setTemplates([]); }
  }, []);

  const players = useMemo(() => dataset ? [...new Set([...dataset.profile.pitcher_names, ...dataset.profile.batter_names])].sort() : [], [dataset]);
  useEffect(() => { if (players.length && !players.includes(player)) setPlayer(players[0]); }, [players, player]);

  function clearWorkspace() { setTurns([]); setArtifacts([]); setActiveId(""); setSelected([]); setProcess([]); setError(""); }
  async function choose(files?: File[]) {
    setBusy(true); setError("");
    try { const loaded = await upload(files); setDataset(loaded); clearWorkspace(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  function chooseFolder(list: FileList | null) {
    const files = Array.from(list ?? []).filter(file => file.name.toLowerCase().endsWith(".csv"));
    if (files.length) void choose(files); else setError("The selected folder contains no CSV files.");
  }
  function registerArtifact(turn: Turn) {
    const artifact = artifactFrom(turn); if (!artifact) return;
    setArtifacts(current => current.some(item => item.id === artifact.id) ? current : [...current, artifact]);
    setActiveId(artifact.id);
  }
  async function runQueries(queries: string[], addResultsToReport = false) {
    if (!dataset || busy || !queries.length) return;
    setBusy(true); setError(""); let history = turns.slice(-6).map(turn => ({role: turn.role, content: turn.text}));
    try {
      for (const question of queries) {
        const userTurn: Turn = {id: crypto.randomUUID(), role:"user", text:question};
        setTurns(current => [...current, userTurn]); setInput(""); setProcess([]);
        const trace: ProgressEvent[] = [];
        const detail = await chat(thread, dataset.dataset_id, question, event => { trace.push(event); setProcess([...trace]); }, history);
        const assistantTurn: Turn = {id: crypto.randomUUID(), role:"assistant", text:detail.answer, question, detail, process:[...trace]};
        setTurns(current => [...current, assistantTurn]); registerArtifact(assistantTurn);
        if (addResultsToReport) setSelected(current => [...current, assistantTurn.id]);
        history = [...history, {role:"user" as const, content:question}, {role:"assistant" as const, content:detail.answer}].slice(-6);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Analysis failed"); }
    finally { setBusy(false); setProcess([]); }
  }
  function reset() {
    const id = crypto.randomUUID(); sessionStorage.setItem("pitchquery-thread", id); setThread(id); clearWorkspace();
  }
  function openArtifact(turn: Turn) { registerArtifact(turn); }
  function closeArtifact(id: string) {
    setArtifacts(current => {
      const index = current.findIndex(item => item.id === id); const next = current.filter(item => item.id !== id);
      if (id === activeId) setActiveId(next[Math.min(index, next.length-1)]?.id ?? ""); return next;
    });
  }
  function toggleReport(id: string) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); setReportOpen(true);
  }
  function moveReport(id: string, direction: -1 | 1) {
    setSelected(current => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index],next[target]]=[next[target],next[index]]; return next; });
  }
  function saveTemplate() {
    const names = [...players].sort((a,b) => b.length-a.length);
    const recipes = selected.map(id => turns.find(turn => turn.id === id)?.question).filter(Boolean).map(question => {
      const source = names.find(name => question!.toLowerCase().includes(name.toLowerCase()));
      return source ? question!.replace(new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"), "{{player}}") : question!;
    });
    if (!recipes.length) return;
    const template: ReportTemplate = {id: templateId || crypto.randomUUID(), name: templateName.trim() || "Scouting Report", recipes};
    const next = templates.some(item => item.id === template.id) ? templates.map(item => item.id === template.id ? template : item) : [...templates, template];
    setTemplates(next); setTemplateId(template.id); localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  }
  function runTemplate() {
    const template = templates.find(item => item.id === templateId); if (!template || !player) return;
    setSelected([]); void runQueries(template.recipes.map(recipe => recipe.replaceAll("{{player}}", player)), true);
  }

  return <>
    <div className={`app-shell ${reportOpen ? "report-is-open" : ""}`}>
      <header className="topbar"><div className="wordmark"><i>⌁</i><b>PITCHQUERY</b></div><div className="dataset-chip"><Database size={13}/><span>{dataset?.profile.file_name ?? "NO ACTIVE DATASET"}</span></div><div className="sync-state"><i/> {dataset ? "TRACKMAN READY" : "AWAITING DATA"}</div><button type="button" className="report-toggle" onClick={() => setReportOpen(!reportOpen)}><PanelRight size={14}/> Report <em>{selected.length}</em></button><button type="button" className="new-session" onClick={reset}><RefreshCw size={14}/> New session</button></header>
      <div className="app-grid"><DataRail dataset={dataset} busy={busy} choose={files => void choose(files)} chooseFolder={chooseFolder}/><ConversationPanel dataset={dataset} turns={turns} busy={busy} process={process} input={input} error={error} selected={selected} setInput={setInput} ask={value => void runQueries([value])} openArtifact={openArtifact} toggleReport={toggleReport}/><Workspace artifacts={artifacts} activeId={activeId} setActive={setActiveId} close={closeArtifact} toggleReport={toggleReport} selected={selected}/><ReportComposer open={reportOpen} turns={turns} selected={selected} templates={templates} templateId={templateId} templateName={templateName} player={player} players={players} busy={busy} setOpen={setReportOpen} setTemplateId={setTemplateId} setTemplateName={setTemplateName} setPlayer={setPlayer} remove={toggleReport} move={moveReport} saveTemplate={saveTemplate} runTemplate={runTemplate}/></div>
    </div>
    <PrintReport turns={turns} selected={selected} player={player}/>
  </>;
}
