import {useState} from "react";
import {Activity, ChevronRight} from "lucide-react";
import type {Message} from "./shared";

function describe(text: string) {
  const first = text.trimStart().split("\n", 1)[0];
  if (!first.startsWith("Command:")) return {label:first || "Agent update", detail:""};
  const command = first.slice(8).trim().replace(/^(?:\S*\/)?(?:ba|z|da)?sh\s+-[a-z]*c\s+(['"])(.*)\1$/, "$2");
  const [name] = command.split(/\s+/);
  const label = ({rg:"Search files", grep:"Search files", cat:"Read files", sed:"Process text", ls:"List files", git:"Run Git"} as Record<string,string>)[name] || "Run command";
  return {label, detail:command};
}

function ActivityStep({message}:{message:Message}) {
  const [open,setOpen] = useState(false);
  const {label,detail} = describe(message.text);
  return <div className="activity-step">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <ChevronRight size={13}/><span>{label}</span>{detail && <code>{detail}</code>}
    </button>
    {open && <pre tabIndex={0} aria-label="Activity details">{message.text}</pre>}
  </div>;
}

export function AgentActivity({steps}:{steps:Message[]}) {
  const [expanded,setExpanded] = useState(false);
  const latest = steps.at(-1);
  if (!latest) return null;
  const heading = <><Activity size={13}/> Agent activity <span>{steps.length} {steps.length===1?"step":"steps"}</span></>;
  return <section className="activity-group" aria-label="Agent activity">
    {steps.length > 1
      ? <button className="activity-heading" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{heading}<ChevronRight size={12}/></button>
      : <div className="activity-heading">{heading}</div>}
    {expanded && <ol className="activity-list">{steps.slice(0,-1).map(step=><li key={step.id}><ActivityStep message={step}/></li>)}</ol>}
    <div className="activity-latest"><ActivityStep key={latest.id} message={latest}/></div>
  </section>;
}
