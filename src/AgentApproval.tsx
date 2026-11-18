import {useState} from 'react';
import type {Approval,Command} from './shared';
export function AgentApproval({approval:a,run}:{approval:Approval;run:(c:Command)=>Promise<void>}){
 const [answers,setAnswers]=useState<Record<string,string[]>>({});
 return <div className="approval"><strong>{a.method}</strong>{a.detail&&<pre>{a.detail}</pre>}{a.questions?.map(q=><fieldset key={q.id}><legend>{q.prompt}</legend>{q.options.map(o=><button key={o.id} aria-pressed={answers[q.id]?.includes(o.id)??false} onClick={()=>setAnswers(current=>({...current,[q.id]:q.allowMultiple?(current[q.id]?.includes(o.id)?current[q.id].filter(id=>id!==o.id):[...(current[q.id]??[]),o.id]):[o.id]}))}>{o.label}</button>)}</fieldset>)}<div><button onClick={()=>void run({type:'approval.respond',id:a.id,accept:false})}>{a.questions?'Skip':'Decline'}</button><button className="small-primary" disabled={!!a.questions?.some(q=>!answers[q.id]?.length)} onClick={()=>void run({type:'approval.respond',id:a.id,accept:true,answers:a.questions?.map(q=>({questionId:q.id,selectedOptionIds:answers[q.id]??[]}))})}>{a.questions?'Submit':'Allow once'}</button></div></div>;
}
