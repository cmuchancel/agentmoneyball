"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  BarChart3, Check, ChevronDown, ChevronUp, Database, Download,
  Eye, FileBarChart, Files, FileText, FileWarning, FolderOpen, GripVertical, PanelRight,
  LockKeyhole, RefreshCw, Save, Send, Table2, Upload, Users, X,
} from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import { Response } from "@/components/ui/response";
import { ShimmeringText } from "@/components/ui/shimmering-text";
import { ArtifactBody, Metrics, ProcessTimeline, ResultTable } from "@/features/scouting/analysis-results";
import { artifactFrom, reportPages, TEMPLATE_STORAGE_KEY } from "@/features/scouting/domain";
import type { Artifact, ReportPageSpec, ReportTemplate, Turn } from "@/features/scouting/domain";
import { conversationPrompts } from "@/features/scouting/prompts";
import { StrikeZone } from "@/features/scouting/strike-zone";
import { Profile, ProgressEvent, chat, loadDemo } from "@/lib/api";

function Roster({ profile }: { profile: Profile }) {
  const list = (names: string[], teams: Record<string, string[]>, label: string) => <div><b>{label}</b><div className="roster-list">{names.map(name => <span key={name}><strong>{name}</strong><small>{teams[name]?.map(team => team.replace("T_", "")).join(" / ")}</small></span>)}</div></div>;
  return <Collapsible.Root className="rail-disclosure"><Collapsible.Trigger><span><Users size={13}/> Roster</span><small>{profile.pitcher_names.length} P / {profile.batter_names.length} B</small><ChevronDown size={13}/></Collapsible.Trigger><Collapsible.Content className="roster-grid">
    {list(profile.pitcher_names, profile.pitcher_teams, "Pitchers")}{list(profile.batter_names, profile.batter_teams, "Batters")}
  </Collapsible.Content></Collapsible.Root>;
}

function GameFiles({ profile }: { profile: Profile }) {
  return <Collapsible.Root className="rail-disclosure" defaultOpen><Collapsible.Trigger><span><Files size={13}/> Game files</span><small>{profile.source_files.length}</small><ChevronDown size={13}/></Collapsible.Trigger><Collapsible.Content className="game-list">{profile.source_files.map((file, index) => <div key={file}><i>{String(index+1).padStart(2,"0")}</i><span>{file}</span></div>)}</Collapsible.Content></Collapsible.Root>;
}

function DataRail({ dataset, busy, open, reloadDemo, close }: {
  dataset?: {dataset_id: string; profile: Profile}; busy: boolean; open: boolean;
  reloadDemo: () => void; close: () => void;
}) {
  const profile = dataset?.profile;
  return <aside className={`data-rail ${open ? "open" : ""}`}><div className="rail-mobile-head"><b>Data explorer</b><button type="button" onClick={close} aria-label="Close data explorer"><X size={16}/></button></div><div className="rail-label">Data explorer</div>
    <div className="upload-stack">
      <button type="button" disabled><Upload size={14}/> Upload CSV</button>
      <button type="button" disabled><FolderOpen size={14}/> Upload folder</button>
      <div className="demo-scope-note"><Database size={14}/><span><b>Demo deployment</b>Private uploads are disabled. This launch uses the bundled 21-game TrackMan dataset stored in Supabase.</span></div>
      <button type="button" onClick={reloadDemo} disabled={busy}><RefreshCw size={14}/> {busy && !dataset ? "Loading demo…" : "Reload demo dataset"}</button>
    </div>
    {profile ? <>
      <div className="rail-stats"><span><b>{profile.games}</b>games</span><span><b>{profile.rows.toLocaleString()}</b>pitches</span><span><b>{profile.pitchers ?? "—"}</b>pitchers</span><span><b>{profile.batters ?? "—"}</b>batters</span></div>
      <GameFiles profile={profile}/><Roster profile={profile}/>
      <div className="rail-note"><FileWarning size={13}/><span>{Object.keys(profile.pitcher_aliases).length ? "Demo names are fictional aliases; source IDs remain attached." : "Roster names come from the uploaded files."}</span></div>
    </> : <div className="rail-empty"><Database size={22}/><b>Loading demo dataset</b><span>The public TrackMan demo is loaded automatically.</span></div>}
  </aside>;
}

function ArtifactPreview({ artifact }: { artifact: Artifact }) {
  return <div className="artifact-preview">
    <div className="preview-title">{artifact.kind === "location" ? <FileBarChart size={13}/> : artifact.kind === "table" ? <Table2 size={13}/> : <BarChart3 size={13}/>}<span>{artifact.title}</span></div>
    {artifact.detail.location_chart
      ? <StrikeZone chart={artifact.detail.location_chart} compact/>
      : artifact.detail.result_table?.length
        ? <ResultTable rows={artifact.detail.result_table} limit={3}/>
        : <Metrics detail={artifact.detail}/>}
  </div>;
}

function CoachTurn({ text }: { text: string }) {
  return <div className="coach-turn">
    <div className="coach-mark"><i>C</i><span>Coach</span></div>
    <div className="coach-bubble">{text}</div>
  </div>;
}

function ConversationPanel({ dataset, turns, busy, process, input, error, selected, setInput, ask, openArtifact, toggleReport }: {
  dataset?: {dataset_id: string; profile: Profile}; turns: Turn[]; busy: boolean; process: ProgressEvent[]; input: string; error: string;
  selected: string[]; setInput: (value: string) => void; ask: (value: string) => void;
  openArtifact: (turn: Turn) => void; toggleReport: (turnId: string) => void;
}) {
  function submit(event: FormEvent) { event.preventDefault(); ask(input); }
  const pitcher = dataset?.profile.pitcher_aliases["1000036206"] ?? dataset?.profile.pitcher_names[0] ?? "a pitcher";
  const examples = conversationPrompts(pitcher);
  return <section className="conversation-panel"><div className="panel-heading"><span>Scouting conversation / 01</span><small>{turns.length ? `${Math.ceil(turns.length/2)} queries` : "Ready"}</small></div>
    <Conversation className="conversation"><ConversationContent className="conversation-content">
      {!turns.length ? <ConversationEmptyState title={dataset ? "Ask the data what matters." : "Load TrackMan data to begin."} description={dataset ? "Answers stay conversational. Charts, tables, and comparisons open beside the chat." : "Use a CSV, a folder of games, or the bundled demo."}>
        <div className="examples">{examples.map(example => <button key={example.label} type="button" onClick={() => ask(example.question)} disabled={!dataset}><b>{example.label}</b><span>{example.question}</span></button>)}</div>
      </ConversationEmptyState> : turns.map(turn => turn.role === "user" ? <CoachTurn text={turn.text} key={turn.id}/> : <Message from="assistant" key={turn.id}><MessageContent variant="flat">
        <>
          <div className="assistant-mark"><i/> Agent Moneyball</div><Response>{turn.text}</Response>
          {artifactFrom(turn) && <button type="button" className="preview-button" onClick={() => openArtifact(turn)} aria-label={`Open ${artifactFrom(turn)?.title}`}><ArtifactPreview artifact={artifactFrom(turn)!}/></button>}
          <div className="response-actions">
            {artifactFrom(turn) && <button type="button" onClick={() => openArtifact(turn)}><FileBarChart size={13}/> Open artifact</button>}
            <button type="button" className={selected.includes(turn.id) ? "selected" : ""} onClick={() => toggleReport(turn.id)}><FileText size={13}/>{selected.includes(turn.id) ? "Added to report" : "Add to report"}{selected.includes(turn.id) && <Check size={12}/>}</button>
          </div>
          {turn.process?.length ? <ProcessTimeline steps={turn.process}/> : null}
        </>
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
    {artifacts.length > 0 && <div className="artifact-tabs" role="tablist" aria-label="Chat artifacts">{artifacts.map(artifact => <div className={`artifact-tab ${artifact.id === active?.id ? "active" : ""}`} key={artifact.id}>
      <button type="button" role="tab" aria-selected={artifact.id === active?.id} className="tab-select" onClick={() => setActive(artifact.id)}>{artifact.kind === "location" ? <FileBarChart size={13}/> : artifact.kind === "table" ? <Table2 size={13}/> : <BarChart3 size={13}/>}<span>{artifact.title}</span></button>
      <button type="button" className="tab-close" onClick={() => close(artifact.id)} aria-label={`Close ${artifact.title}`}><X size={13}/></button>
    </div>)}</div>}
    {active ? <><div className="artifact-heading"><div><span>{active.kind === "location" ? "Location analysis" : active.kind === "table" ? "Data table" : "Scouting summary"}</span><h2>{active.title}</h2></div><button type="button" className={selected.includes(active.turnId) ? "selected" : ""} onClick={() => toggleReport(active.turnId)}><FileText size={14}/>{selected.includes(active.turnId) ? "In report" : "Add to report"}</button></div><div className="artifact-scroll"><ArtifactBody artifact={active}/></div></> : <div className="workspace-empty"><div><FileBarChart size={26}/></div><span>Artifact workspace</span><h2>Charts and tables open here.</h2><p>Ask a question in the conversation. Structured results create tabs automatically—there are no empty tabs to manage.</p></div>}
  </section>;
}

function ReportThumbnail({ page, index }: { page: ReportPageSpec; index: number }) {
  const artifact = artifactFrom(page.turn);
  return <div className="page-thumb"><div className="page-paper">
    <span>AGENT MONEYBALL / ADVANCE REPORT</span>
    <b>{artifact?.title || page.turn.question || "Scouting response"}</b>
    {page.mode !== "chart" && <div className="page-summary"><Response>{page.turn.text}</Response></div>}
    {artifact && page.mode !== "chart" && <Metrics detail={artifact.detail}/>}
    {artifact?.detail.location_chart && page.mode !== "summary" ? <StrikeZone chart={artifact.detail.location_chart} compact/> : null}
    {artifact?.detail.result_table?.length && page.mode !== "chart" ? <ResultTable rows={artifact.detail.result_table} limit={5}/> : null}
  </div><small>Page {index+1}</small></div>;
}

function ReportComposer({ open, turns, selected, templates, templateId, templateName, player, players, busy, setOpen, setTemplateId, setTemplateName, setPlayer, remove, move, saveTemplate, runTemplate, previewReport }: {
  open: boolean; turns: Turn[]; selected: string[]; templates: ReportTemplate[]; templateId: string; templateName: string; player: string; players: string[]; busy: boolean;
  setOpen: (open: boolean) => void; setTemplateId: (id: string) => void; setTemplateName: (name: string) => void; setPlayer: (name: string) => void;
  remove: (id: string) => void; move: (id: string, direction: -1 | 1) => void; saveTemplate: () => void; runTemplate: () => void; previewReport: () => void;
}) {
  const items = selected.map(id => turns.find(turn => turn.id === id)).filter(Boolean) as Turn[];
  const pages = reportPages(turns, selected);
  return <aside className={`report-composer ${open ? "open" : ""}`}><div className="composer-head"><div><span>Report workspace</span><h2>Report Composer</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close report composer"><X size={17}/></button></div>
    <div className="composer-scroll"><section className="composer-section"><label>Saved template</label><select value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">No template selected</option>{templates.map(template => <option value={template.id} key={template.id}>{template.name}</option>)}</select>
      <label>Template name</label><div className="inline-control"><input value={templateName} onChange={event => setTemplateName(event.target.value)}/><button type="button" onClick={saveTemplate} disabled={!items.length} title="Save selected questions as a reusable template"><Save size={14}/></button></div>
      <label>Player variable</label><select value={player} onChange={event => setPlayer(event.target.value)}>{players.map(name => <option key={name}>{name}</option>)}</select>
      <button type="button" className="generate-report" onClick={runTemplate} disabled={!templateId || !player || busy}><RefreshCw size={14}/> Generate selected template for player</button><p className="composer-help">Templates store the original questions as recipes and replace the player with <code>{"{{player}}"}</code>.</p>
    </section>
    <section className="composer-section"><div className="section-title"><label>Selected responses</label><small>{items.length} items</small></div>{items.length ? <div className="selected-items">{items.map((turn, index) => { const artifact = artifactFrom(turn); return <div key={turn.id}><GripVertical size={14}/><span>{artifact?.title || turn.question || "Scouting response"}</span><div><button type="button" onClick={() => move(turn.id,-1)} disabled={index===0} aria-label="Move up"><ChevronUp size={13}/></button><button type="button" onClick={() => move(turn.id,1)} disabled={index===items.length-1} aria-label="Move down"><ChevronDown size={13}/></button><button type="button" onClick={() => remove(turn.id)} aria-label="Remove"><X size={13}/></button></div></div>; })}</div> : <div className="composer-empty">Use “Add to report” on any response.</div>}</section>
    <section className="composer-section"><div className="section-title"><label>US Letter preview</label><small>{pages.length} pages</small></div><div className="page-thumbnails">{pages.map((page,index) => <ReportThumbnail page={page} index={index} key={page.id}/>)}</div></section></div>
    <div className="composer-footer"><span>{items.length} selected · US Letter</span><div><button type="button" className="preview-pdf" onClick={previewReport} disabled={!items.length}><Eye size={15}/> Preview PDF</button><button type="button" onClick={() => window.print()} disabled={!items.length}><Download size={15}/> Export PDF</button></div></div>
  </aside>;
}

function ReportPage({ page, index, total, player, className }: { page: ReportPageSpec; index: number; total: number; player: string; className: string }) {
  const artifact = artifactFrom(page.turn);
  return <article className={className}><header><div><b>AGENT MONEYBALL</b><span>TRACKMAN ADVANCE REPORT</span></div><small>{player || "SCOUTING REPORT"} · {index+1} / {total}</small></header><h1>{artifact?.title || page.turn.question || "Scouting analysis"}</h1><p className="print-question">{page.turn.question}{page.mode === "chart" ? " · Complete location chart" : ""}</p>{page.mode !== "chart" && <div className="print-answer"><Response>{page.turn.text}</Response></div>}{artifact && <ArtifactBody artifact={artifact} print mode={page.mode}/>}<footer>Generated from executed Agent Moneyball evidence. Verify game-planning decisions against source video and staff context.</footer></article>;
}

function PdfPreview({ open, turns, selected, player, close }: { open: boolean; turns: Turn[]; selected: string[]; player: string; close: () => void }) {
  if (!open) return null;
  const pages = reportPages(turns, selected);
  return <section className="pdf-preview-overlay" role="dialog" aria-modal="true" aria-label="PDF preview"><header><div><span>US Letter / Portrait</span><h2>Report preview</h2></div><div><button type="button" onClick={() => window.print()}><Download size={15}/> Print / Save PDF</button><button type="button" onClick={close} aria-label="Close PDF preview"><X size={18}/></button></div></header><div className="pdf-preview-scroll">{pages.map((page,index) => <ReportPage page={page} index={index} total={pages.length} player={player} className="preview-sheet" key={page.id}/>)}</div></section>;
}

function PrintReport({ turns, selected, player }: { turns: Turn[]; selected: string[]; player: string }) {
  const pages = reportPages(turns, selected);
  return <div className="report-print-root">{pages.map((page,index) => <ReportPage page={page} index={index} total={pages.length} player={player} className="print-sheet" key={page.id}/>)}</div>;
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
  const [dataOpen, setDataOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("Pitcher Advance Report");
  const [player, setPlayer] = useState("");
  const [mobileView, setMobileView] = useState<"conversation" | "artifact">("conversation");
  const [previewOpen, setPreviewOpen] = useState(false);
  const loadedDemo = useRef(false);

  useEffect(() => {
    const id = sessionStorage.getItem("pitchquery-thread") ?? crypto.randomUUID();
    sessionStorage.setItem("pitchquery-thread", id); setThread(id);
    try { setTemplates(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) ?? "[]")); } catch { setTemplates([]); }
    if (!loadedDemo.current) { loadedDemo.current = true; void choose(); }
  }, []);

  const players = useMemo(() => dataset ? [...new Set([...dataset.profile.pitcher_names, ...dataset.profile.batter_names])].sort() : [], [dataset]);
  useEffect(() => { if (players.length && !players.includes(player)) setPlayer(players[0]); }, [players, player]);

  function clearWorkspace() { setTurns([]); setArtifacts([]); setActiveId(""); setSelected([]); setProcess([]); setError(""); setMobileView("conversation"); setReportOpen(false); setPreviewOpen(false); }
  async function choose() {
    setBusy(true); setError("");
    try { const loaded = await loadDemo(); setDataset(loaded); setDataOpen(false); clearWorkspace(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Demo dataset failed to load"); }
    finally { setBusy(false); }
  }
  function registerArtifact(turn: Turn) {
    const artifact = artifactFrom(turn); if (!artifact) return;
    setArtifacts(current => current.some(item => item.id === artifact.id) ? current : [...current, artifact]);
    setActiveId(artifact.id);
  }
  async function runQueries(queries: string[], addResultsToReport = false) {
    if (!dataset || busy || !queries.length) return;
    setBusy(true); setError(""); setMobileView("conversation"); let history = turns.slice(-6).map(turn => ({role: turn.role, content: turn.text}));
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
  function openArtifact(turn: Turn) { registerArtifact(turn); setMobileView("artifact"); }
  function closeArtifact(id: string) {
    setArtifacts(current => {
      const index = current.findIndex(item => item.id === id); const next = current.filter(item => item.id !== id);
      if (id === activeId) setActiveId(next[Math.min(index, next.length-1)]?.id ?? "");
      if (!next.length) setMobileView("conversation"); return next;
    });
  }
  function detectPlayer(question?: string) {
    if (!question) return;
    return [...players].sort((a,b) => b.length-a.length).find(name => question.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  }
  function toggleReport(id: string) {
    if (!selected.includes(id)) {
      const detected = detectPlayer(turns.find(turn => turn.id === id)?.question);
      if (detected) setPlayer(detected);
    }
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); setReportOpen(true);
  }
  function moveReport(id: string, direction: -1 | 1) {
    setSelected(current => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index],next[target]]=[next[target],next[index]]; return next; });
  }
  function saveTemplate() {
    const recipes = selected.map(id => turns.find(turn => turn.id === id)?.question).filter(Boolean).map(question => {
      const source = detectPlayer(question);
      return source ? question!.replace(new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"), "{{player}}") : question!;
    });
    if (!recipes.length) return;
    const name = templateName.trim() || "Scouting Report";
    const sameName = templates.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const template: ReportTemplate = {id: templateId || sameName?.id || crypto.randomUUID(), name, recipes};
    const next = templates.some(item => item.id === template.id) ? templates.map(item => item.id === template.id ? template : item) : [...templates, template];
    setTemplates(next); setTemplateId(template.id); localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
  }
  function runTemplate() {
    const template = templates.find(item => item.id === templateId); if (!template || !player) return;
    setSelected([]); void runQueries(template.recipes.map(recipe => recipe.replaceAll("{{player}}", player)), true);
  }

  return <>
    <div className={`app-shell ${reportOpen ? "report-is-open" : ""}`} data-mobile-view={mobileView}>
      <header className="topbar"><div className="wordmark"><i>⌁</i><b>AGENT MONEYBALL</b></div><div className="dataset-chip"><Database size={13}/><span>{dataset?.profile.file_name ?? "NO ACTIVE DATASET"}</span></div><div className="sync-state"><i/> {dataset ? "TRACKMAN READY" : "AWAITING DATA"}</div><button type="button" className="data-toggle" title="Data explorer" onClick={() => setDataOpen(!dataOpen)}><Database size={14}/> Data</button><button type="button" className="report-toggle" title="Report composer" onClick={() => setReportOpen(!reportOpen)}><PanelRight size={14}/> Report <em>{selected.length}</em></button><form action="/api/auth/logout" method="post" className="lock-form"><button type="submit" title="Lock Agent Moneyball"><LockKeyhole size={14}/> Lock</button></form><button type="button" className="new-session" title="Start a new session" onClick={reset}><RefreshCw size={14}/> New session</button></header>
      <div className="app-grid"><DataRail dataset={dataset} busy={busy} open={dataOpen} reloadDemo={() => void choose()} close={() => setDataOpen(false)}/><nav className="mobile-modebar" aria-label="Workspace view"><button type="button" className={mobileView === "conversation" ? "active" : ""} onClick={() => setMobileView("conversation")}>Conversation</button><button type="button" className={mobileView === "artifact" ? "active" : ""} onClick={() => setMobileView("artifact")} disabled={!artifacts.length}>Artifact <em>{artifacts.length}</em></button></nav><ConversationPanel dataset={dataset} turns={turns} busy={busy} process={process} input={input} error={error} selected={selected} setInput={setInput} ask={value => void runQueries([value])} openArtifact={openArtifact} toggleReport={toggleReport}/><Workspace artifacts={artifacts} activeId={activeId} setActive={setActiveId} close={closeArtifact} toggleReport={toggleReport} selected={selected}/><ReportComposer open={reportOpen} turns={turns} selected={selected} templates={templates} templateId={templateId} templateName={templateName} player={player} players={players} busy={busy} setOpen={setReportOpen} setTemplateId={id => { setTemplateId(id); const template = templates.find(item => item.id === id); if (template) setTemplateName(template.name); }} setTemplateName={setTemplateName} setPlayer={setPlayer} remove={toggleReport} move={moveReport} saveTemplate={saveTemplate} runTemplate={runTemplate} previewReport={() => setPreviewOpen(true)}/></div>
    </div>
    <PdfPreview open={previewOpen} turns={turns} selected={selected} player={player} close={() => setPreviewOpen(false)}/>
    <PrintReport turns={turns} selected={selected} player={player}/>
  </>;
}
