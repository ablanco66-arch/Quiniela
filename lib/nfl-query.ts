import { env } from "cloudflare:workers";

export function validateNflDate(value:unknown):string {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value){
    throw new Error("Indica una fecha válida en formato AAAA-MM-DD");
  }
  return value;
}

export async function queryNflDate(value:unknown){
  const date=validateNflDate(value);
  const apiKey=env.BALLDONTLIE_API_KEY;
  if(!apiKey)throw new Error("BALLDONTLIE_API_KEY no está configurada");
  const games:Array<{id:number;date:string;visitor:string;home:string;visitorScore:number|null;homeScore:number|null;status:string;state:string}>=[];
  let cursor:unknown=null;
  const seen=new Set<string>();
  do{
    const url=new URL("https://api.balldontlie.io/nfl/v1/games");
    url.searchParams.set("dates[]",date);
    url.searchParams.set("per_page","100");
    if(cursor!==null)url.searchParams.set("cursor",String(cursor));
    const response=await fetch(url,{headers:{Authorization:apiKey,Accept:"application/json"},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`BALLDONTLIE respondió ${response.status}`);
    const payload=await response.json() as {data?:Array<{id:number;date:string;visitor_team:{full_name:string};home_team:{full_name:string};visitor_team_score:number|null;home_team_score:number|null;status:string;status_state:string}>;meta?:{next_cursor?:number|null}};
    if(!Array.isArray(payload.data))throw new Error("BALLDONTLIE devolvió una respuesta no válida");
    games.push(...payload.data.map(game=>({id:game.id,date:game.date,visitor:game.visitor_team.full_name,home:game.home_team.full_name,visitorScore:game.visitor_team_score,homeScore:game.home_team_score,status:game.status,state:game.status_state})));
    cursor=payload.meta?.next_cursor??null;
    if(cursor!==null){if(seen.has(String(cursor)))throw new Error("BALLDONTLIE devolvió una paginación no válida");seen.add(String(cursor));}
  }while(cursor!==null);
  return{status:"checked",provider:"BALLDONTLIE",date,queriedAt:new Date().toISOString(),checked:games.length,message:games.length?`${games.length} partido(s) encontrado(s).`:"Consulta exitosa: no hay partidos para esta fecha.",games};
}
