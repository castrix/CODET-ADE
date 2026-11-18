import {useEffect,useId,useRef,useState} from "react";
import {Check,ChevronDown,Sparkles} from "lucide-react";
import type {Snapshot} from "./shared";
type Model=Snapshot["provider"]["models"][number];
type Props={models:Model[];selected?:Model;current:string;levels:Model["efforts"];index:number;label:(value:string)=>string;onModel:(id:string)=>void;onEffort:(value:string)=>void;connected:boolean};

export function ModelPicker({models,selected,current,levels,index,label,onModel,onEffort,connected}:Props){
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",close);
    panel.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return ()=>document.removeEventListener("pointerdown",close);
  },[open]);
  return <div className="model-picker" ref={root} onBlur={e=>{if(e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{
    if(e.key==="Escape" && open){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}
  }}>
    <button ref={trigger} type="button" className="model-picker-trigger" aria-label="Model and reasoning effort" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>
      <Sparkles size={13}/><span>{selected?.label ?? "Choose model"}</span>{current && <small>{label(current)}</small>}<ChevronDown size={12}/>
    </button>
    {open && <div ref={panel} id={id} role="dialog" aria-label="Model and effort" className="model-picker-panel">
      <div className="picker-heading">Models <span>Providers</span></div>
      <div className="picker-models" role="radiogroup" aria-label="Model" onKeyDown={e=>{
        if(!["ArrowDown","ArrowUp","Home","End"].includes(e.key))return;
        e.preventDefault();const choices=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
        const at=choices.indexOf(document.activeElement as HTMLButtonElement);
        const next=e.key==="Home"?0:e.key==="End"?choices.length-1:(at+(e.key==="ArrowDown"?1:-1)+choices.length)%choices.length;
        choices[next]?.focus();
      }}>
        {models.map(m=><button type="button" role="radio" aria-checked={selected?.id===m.id} key={m.id} onClick={()=>onModel(m.id)}><span>{m.label}</span>{selected?.id===m.id && <Check size={14}/>}</button>)}
        {!models.length && <p>{connected?"No models available":"Connecting to Codex…"}</p>}
      </div>
      {levels.length>0 && <div className="picker-effort">
        <div className="picker-heading">Effort <strong>{current?label(current):"Unavailable"}</strong></div>
        <div className="picker-slider"><input aria-label="Reasoning effort" aria-valuetext={label(current)} type="range" min={0} max={Math.max(0,levels.length-1)} step={1} value={index} disabled={levels.length<2} onChange={e=>onEffort(levels[Number(e.target.value)].level)}/></div>
        <div className="picker-scale"><span>Faster</span><span>More thorough</span></div>
      </div>}
    </div>}
  </div>;
}
