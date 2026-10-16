import { syncNflResults } from "../../lib/nfl-results";
import { queryNflDate } from "../../lib/nfl-query";

const SERVER_INFO={name:"quiniela-mnf-2026",version:"1.0.0"};
const TOOLS=[
  {name:"query_nfl_date",description:"Consulta partidos NFL en BALLDONTLIE para una fecha AAAA-MM-DD, incluso fuera de la ventana de seguimiento. Sólo lectura: no registra ni modifica resultados. La fecha corresponde al día local de Ciudad Juárez.",inputSchema:{type:"object",properties:{date:{type:"string",description:"Fecha local de Ciudad Juárez en formato AAAA-MM-DD"}},required:["date"],additionalProperties:false}},
  {name:"sync_nfl_results",description:"Consulta BALLDONTLIE, confirma marcadores finales de los juegos de la quiniela y prepara los registros ganadores. Fuera de la ventana de seguimiento no realiza cambios.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
];

export async function POST(request:Request){
  try{
    const body=await request.json() as {jsonrpc?:string;id?:string|number|null;method?:string;params?:{name?:string;arguments?:Record<string,unknown>}};
    const id=body.id??null;
    if(body.method==="initialize")return rpc(id,{protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:SERVER_INFO});
    if(body.method==="notifications/initialized")return new Response(null,{status:202});
    if(body.method==="tools/list")return rpc(id,{tools:TOOLS});
    if(body.method==="tools/call"){
      if(!["sync_nfl_results","query_nfl_date"].includes(body.params?.name??""))return rpcError(id,-32601,"Herramienta desconocida");
      const email=(request.headers.get("oai-authenticated-user-email")??"").trim().toLowerCase();
      if(email&&email!=="ablanco66@gmail.com")return new Response(JSON.stringify({error:"No autorizado"}),{status:403,headers:{"Content-Type":"application/json"}});
      if(body.params?.name==="query_nfl_date"){
        if(email!=="ablanco66@gmail.com")return Response.json({error:"No autorizado"},{status:403});
        const result=await queryNflDate(body.params.arguments?.date);
        return rpc(id,{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result,isError:false});
      }
      const summary=await syncNflResults();
      return rpc(id,{content:[{type:"text",text:JSON.stringify(summary)}],structuredContent:summary,isError:summary.status==="error"});
    }
    return rpcError(id,-32601,"Método desconocido");
  }catch(error){return rpcError(null,-32000,error instanceof Error?error.message:"No fue posible actualizar los resultados");}
}

function rpc(id:string|number|null,result:unknown){return Response.json({jsonrpc:"2.0",id,result});}
function rpcError(id:string|number|null,code:number,message:string){return Response.json({jsonrpc:"2.0",id,error:{code,message}},{status:code===-32601?404:500});}
