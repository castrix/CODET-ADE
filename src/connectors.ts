export type ConnectorConfig={id:string;name:string;command:string;args:string[];env?:Record<string,string>;enabled:boolean;customModels:string[]};
export type ConnectorStatus=Omit<ConnectorConfig,'env'> & {envKeys:string[];connected:boolean;account:string;error?:string;authMethods:{id:string;name:string;description?:string;type?:string}[];models:{id:string;label:string;efforts:{level:string;description:string}[];defaultEffort:string;isDefault:boolean}[];options:any[];loginOutput?:string;loginActive?:boolean};
export type ConnectorCommand=
 | {type:'connector.save';config:ConnectorConfig}
 | {type:'connector.remove'|'connector.connect'|'connector.disconnect';id:string}
 | {type:'connector.auth';id:string;methodId:string}
 | {type:'connector.login-input';id:string;text:string}
 | {type:'connector.login-cancel';id:string}
 | {type:'chat.provider-option';id:string;option:string;value:string};
export const connectorModel=(id:string,model:string)=>`acp:${encodeURIComponent(id)}:${encodeURIComponent(model)}`;
export function parseConnectorModel(value?:string){if(!value?.startsWith('acp:'))return;const [,id,...model]=value.split(':');return {id:decodeURIComponent(id),model:decodeURIComponent(model.join(':'))};}

export const connectorPresets:ConnectorConfig[]=[
 {id:'claude',name:'Claude',command:'@bundled/claude',args:[],enabled:true,customModels:[]},
 {id:'cursor',name:'Cursor',command:'agent',args:['acp'],enabled:true,customModels:[]},
 {id:'opencode',name:'OpenCode',command:'opencode',args:['acp'],enabled:true,customModels:[]},
 {id:'gemini',name:'Gemini',command:'gemini',args:['--acp'],enabled:true,customModels:[]},
];
