import {useEffect,useState} from "react";
import {FileText,Image} from "lucide-react";
import type {Attachment} from "./shared";
export function AttachmentPreview({file}:{file:Attachment}){
  const [src,setSrc]=useState("");
  useEffect(()=>{let mounted=true;if(file.kind==="image")void window.dao.attachmentPreview(file.id).then(value=>{if(mounted)setSrc(value);}).catch(()=>{});return ()=>{mounted=false;};},[file.id,file.kind]);
  return <>{file.kind==="image"?(src?<img className="attachment-preview" src={src} alt={file.name}/>:<Image size={20}/>):<FileText size={18}/>}<span className="attachment-name" title={file.name}>{file.name}<small>{Math.ceil(file.size/1024)} KB</small></span></>;
}
