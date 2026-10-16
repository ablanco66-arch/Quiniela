import { env } from "cloudflare:workers";

export function validateNflDate(value:unknown):string {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value){
    throw new Error("Indica una fecha válida en formato AAAA-MM-DD");
  }
  return value;
}

const TIME_ZONE="America/Ciudad_Juarez";
const localDateFormat=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"});
export function nflLocalDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value))throw new Error("BALLDONTLIE devolvió una hora de partido sin zona horaria válida");
  const instant=new Date(value);
  if(!Number.isFinite(instant.getTime()))throw new Error("BALLDONTLIE devolvió una hora de partido no válida");
  const parts=localDateFormat.formatToParts(instant);
  const part=(type:string)=>parts.find(item=>item.type===type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function queryNflDate(value:unknown){
  const date=validateNflDate(value);
  const apiKey=env.BALLDONTLIE_API_KEY;
  if(!apiKey)throw new Error("BALLDONTLIE_API_KEY no está configurada");
  const games:Array<{id:number;date:string;localDate:string;localTime:string;visitor:string;home:string;visitorScore:number|null;homeScore:number|null;status:string;state:string}>=[];
  let cursor:unknown=null;
  const seen=new Set<string>();
  do{
    const url=new URL("https://api.balldontlie.io/nfl/v1/games");
    url.searchParams.append("dates[]",date);
    const followingDay=new Date(`${date}T00:00:00Z`);followingDay.setUTCDate(followingDay.getUTCDate()+1);
    url.searchParams.append("dates[]",followingDay.toISOString().slice(0,10));
    url.searchParams.set("per_page","100");
    if(cursor!==null)url.searchParams.set("cursor",String(cursor));
    const response=await fetch(url,{headers:{Authorization:apiKey,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`BALLDONTLIE respondió ${response.status}`);
    const payload=await response.json() as {data?:Array<{id:number;date:string;visitor_team:{full_name:string};home_team:{full_name:string};visitor_team_score:number|null;home_team_score:number|null;status:string;status_state:string}>;meta?:{next_cursor?:number|null}};
    if(!Array.isArray(payload.data))throw new Error("BALLDONTLIE devolvió una respuesta no válida");
    games.push(...payload.data.filter(game=>nflLocalDate(game.date)===date).map(game=>({id:game.id,date:game.date,localDate:date,localTime:new Intl.DateTimeFormat("es-MX",{timeZone:TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(game.date)),visitor:game.visitor_team.full_name,home:game.home_team.full_name,visitorScore:game.visitor_team_score,homeScore:game.home_team_score,status:game.status,state:game.status_state})));
    cursor=payload.meta?.next_cursor??null;
    if(cursor!==null){if(seen.has(String(cursor)))throw new Error("BALLDONTLIE devolvió una paginación no válida");seen.add(String(cursor));}
  }while(cursor!==null);
  return{timeZone:TIME_ZONE,status:"checked",provider:"BALLDONTLIE",date,queriedAt:new Date().toISOString(),checked:games.length,message:games.length?`${games.length} partido(s) encontrado(s).`:"Consulta exitosa: no hay partidos para esta fecha.",games};
}
