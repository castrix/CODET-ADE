import {useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Check,ChevronDown} from "lucide-react";
type Option={value:string;label:string};
export function Dropdown({label,value,options,onChange,disabled=false}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;disabled?:boolean}){
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [position,setPosition]=useState({left:0,top:0,width:220,maxHeight:240});
  const root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const prefix=useRef({text:"",time:0});const id=useId();
  const selected=options.find(o=>o.value===value);
  const close=()=>setOpen(false);
  const show=()=>{setActive(Math.max(0,options.findIndex(o=>o.value===value)));setOpen(true);};
  const choose=(index:number)=>{if(options[index])onChange(options[index].value);close();trigger.current?.focus();};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const r=trigger.current!.getBoundingClientRect();
      const width=Math.min(Math.max(r.width,220),window.innerWidth-24);
      const below=window.innerHeight-r.bottom-12,above=r.top-12;
      const up=below<Math.min(options.length*36+10,240) && above>below;
      const height=Math.min(240,up?above:below);
      setPosition({left:Math.max(12,Math.min(r.left,window.innerWidth-width-12)),top:up?r.top-6-Math.min(options.length*36+10,height):r.bottom+6,width,maxHeight:height});
    };
    place();window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return ()=>{window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[open,options.length]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:Event)=>{if(!root.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))close();};
    document.addEventListener("pointerdown",outside);document.addEventListener("focusin",outside);
    return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("focusin",outside);};
  },[open]);
  useEffect(()=>{if(open)panel.current?.children[active]?.scrollIntoView({block:"nearest"});},[open,active]);
  return <div ref={root} className="dropdown">
    <button type="button" ref={trigger} className="dropdown-trigger" role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?id:undefined} aria-activedescendant={open?`${id}-${active}`:undefined} disabled={disabled || !options.length} onClick={()=>open?close():show()} onKeyDown={e=>{
      if(e.key==="Escape"){if(open){e.preventDefault();e.stopPropagation();close();}return;}
      if(e.key==="Tab"){close();return;}
      if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){
        e.preventDefault();if(!open){show();return;}
        setActive(i=>e.key==="Home"?0:e.key==="End"?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==="ArrowDown"?1:-1))));return;
      }
      if(e.key==="Enter" || e.key===" "){e.preventDefault();if(open)choose(active);else show();return;}
      if(e.key.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        e.preventDefault();const now=Date.now();prefix.current={text:(now-prefix.current.time<700?prefix.current.text:"")+e.key.toLowerCase(),time:now};
        const next=options.findIndex(o=>o.label.toLowerCase().startsWith(prefix.current.text));
        if(!open)show();if(next>=0)setActive(next);
      }
    }}><span>{selected?.label ?? (options.length?"Choose…":"Unavailable")}</span><ChevronDown size={14} strokeWidth={1.75}/></button>
    {open && createPortal(<div id={id} ref={panel} role="listbox" aria-label={label} className="dropdown-panel" style={position}>{options.map((o,i)=><div id={`${id}-${i}`} key={o.value} role="option" aria-selected={o.value===value} className={`dropdown-option ${i===active?"highlighted":""}`} onMouseEnter={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}><span>{o.label}</span>{o.value===value && <Check size={14}/>}</div>)}</div>,document.body)}
  </div>;
}
