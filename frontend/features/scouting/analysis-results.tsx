import * as Collapsible from "@radix-ui/react-collapsible";
import { BarChart3, Check, ChevronDown, Code2, Database, FileWarning, Filter } from "lucide-react";

import { ShimmeringText } from "@/components/ui/shimmering-text";
import type { Answer, ProgressEvent } from "@/lib/api";
import type { Artifact, ReportPageMode } from "@/features/scouting/domain";
import { displayValue, titleCase } from "@/features/scouting/domain";
import { StrikeZone } from "@/features/scouting/strike-zone";

export function ProcessTimeline({ steps, live = false }: { steps: ProgressEvent[]; live?: boolean }) {
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

export function Evidence({ detail }: { detail: Answer }) {
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

export function Metrics({ detail }: { detail: Answer }) {
  if (!detail.metrics?.length) return null;
  return <div className="metric-strip">{detail.metrics.slice(0, 6).map((metric, index) => <div key={`${metric.name}-${index}`}>
    <span>{metric.name}</span><b>{displayValue(metric.value)}{metric.unit === "percent" || metric.unit === "%" ? "%" : metric.unit ? ` ${metric.unit}` : ""}</b>
    {metric.numerator != null && metric.denominator != null && <small>{metric.numerator.toLocaleString()} / {metric.denominator.toLocaleString()}</small>}
  </div>)}</div>;
}

export function ResultTable({ rows, limit = 50, offset = 0 }: {
  rows?: Record<string, unknown>[] | null;
  limit?: number;
  offset?: number;
}) {
  if (!rows?.length) return null;
  const columns = Object.keys(rows[0]).slice(0, 8);
  const visible = rows.slice(offset, offset + limit);
  const first = offset + 1;
  const last = offset + visible.length;
  return <div className="result-table-wrap"><table><thead><tr>{columns.map(column => <th key={column}>{titleCase(column)}</th>)}</tr></thead><tbody>
    {visible.map((row, index) => <tr key={offset + index}>{columns.map(column => <td key={column}>{displayValue(row[column])}</td>)}</tr>)}
  </tbody></table>{(offset > 0 || last < rows.length) && <small>Rows {first.toLocaleString()}–{last.toLocaleString()} of {rows.length.toLocaleString()}.</small>}</div>;
}

export function ArtifactBody({ artifact, print = false, mode = "full", rowStart = 0, rowLimit }: {
  artifact: Artifact;
  print?: boolean;
  mode?: ReportPageMode;
  rowStart?: number;
  rowLimit?: number;
}) {
  const detail = artifact.detail;
  return <div className={`artifact-body ${print ? "print-artifact" : ""}`}>
    {mode !== "chart" && mode !== "table" && (
      <Metrics detail={detail}/>
    )}
    {mode !== "summary" && mode !== "table" && detail.location_chart && <StrikeZone chart={detail.location_chart}/>}<ResultTable rows={mode === "chart" ? null : detail.result_table} offset={rowStart} limit={rowLimit ?? (print ? 18 : 50)}/>
    {!print && (
      <Evidence detail={detail}/>
    )}
  </div>;
}
