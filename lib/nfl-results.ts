import { env } from "cloudflare:workers";

type Game = { date:string; visitor:string; home:string };
type ProviderTeam = { id:number; full_name:string; abbreviation:string };
type ProviderGame = {
  id:number;
  date:string;
  season:number;
  week:number;
  status:string;
  status_state:string;
  visitor_team:ProviderTeam;
  home_team:ProviderTeam;
  visitor_team_score:number|null;
  home_team_score:number|null;
  visitor_team_ot:number|null;
  home_team_ot:number|null;
};

type TrackingRow = {
  gameId:number;
  providerGameId:number|null;
  providerStatus:string;
  state:string;
  observedVisitorScore:number|null;
  observedHomeScore:number|null;
  firstFinalAt:string;
  confirmedAt:string;
};

export type SyncSummary = {
  status:"idle"|"checked"|"error";
  message:string;
  checked:number;
  confirmed:number;
  awaitingConfirmation:number;
  pending:number;
  errors:number;
  games:Array<{ gameId:number; matchup:string; state:string; providerStatus:string; score?:string; detail?:string }>;
};

const API_ROOT="https://api.balldontlie.io/nfl/v1";
const TIME_ZONE="America/Ciudad_Juarez";
const CONFIRMATION_DELAY_MS=5*60*1000;

export async function syncNflResults(options:{ force?:boolean; now?:Date }={}):Promise<SyncSummary>{
  const now=options.now??new Date();
  const settings=await env.DB.prepare("SELECT season_name AS seasonName, games_json AS gamesJson FROM settings WHERE id = 1").first<{seasonName:string;gamesJson:string}>();
  const seasonName=String(settings?.seasonName??"");
  const games=parseGames(settings?.gamesJson??"");
  const active=games.map((game,index)=>({game,index,isoDate:gameDateIso(game.date,seasonName)})).filter((item)=>item.isoDate&&isTrackingWindow(item.isoDate!,now));
  if(!options.force&&active.length===0)return{status:"idle",message:"No hay juegos de la quiniela en ventana de seguimiento.",checked:0,confirmed:0,awaitingConfirmation:0,pending:0,errors:0,games:[]};
  const candidates=options.force?games.map((game,index)=>({game,index,isoDate:gameDateIso(game.date,seasonName)})).filter((item)=>item.isoDate):active;
  if(!candidates.length)return{status:"idle",message:"La temporada no contiene fechas reconocibles.",checked:0,confirmed:0,awaitingConfirmation:0,pending:0,errors:0,games:[]};
  const apiKey=env.BALLDONTLIE_API_KEY;
  if(!apiKey)throw new Error("BALLDONTLIE_API_KEY no está configurada");

  const uniqueDates=[...new Set(candidates.flatMap((item)=>[item.isoDate!,addDays(item.isoDate!,1)]))];
  const url=new URL(`${API_ROOT}/games`);
  uniqueDates.forEach((date)=>url.searchParams.append("dates[]",date));
  url.searchParams.append("seasons[]",seasonName);
  url.searchParams.set("season_types[]","2");
  url.searchParams.set("per_page","100");
  const response=await fetch(url,{headers:{Authorization:apiKey,Accept:"application/json"}});
  if(!response.ok)throw new Error(`BALLDONTLIE respondió ${response.status}`);
  const payload=await response.json() as {data?:ProviderGame[]};
  const providerGames=Array.isArray(payload.data)?payload.data:[];
  const details:SyncSummary["games"]=[];
  let confirmed=0,awaitingConfirmation=0,pending=0,errors=0;

  for(const item of candidates){
    const gameId=item.index+1;
    const match=providerGames.find((provider)=>sameTeam(provider.visitor_team.full_name,item.game.visitor)&&sameTeam(provider.home_team.full_name,item.game.home));
    if(!match){
      pending++;
      await upsertTracking(gameId,null,item.isoDate!,"not_found","pending",null,null,"No se encontró una coincidencia exacta de equipos",now);
      details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:"pending",providerStatus:"not_found",detail:"Sin coincidencia exacta"});
      continue;
    }
    const tracking=await env.DB.prepare(`SELECT game_id AS gameId, provider_game_id AS providerGameId, provider_status AS providerStatus, state, observed_visitor_score AS observedVisitorScore, observed_home_score AS observedHomeScore, first_final_at AS firstFinalAt, confirmed_at AS confirmedAt FROM nfl_result_tracking WHERE game_id = ?`).bind(gameId).first<TrackingRow>();
    const providerState=String(match.status_state||"unknown");
    const visitorScore=numberOrNull(match.visitor_team_score),homeScore=numberOrNull(match.home_team_score);
    if(providerState!=="final"||visitorScore===null||homeScore===null){
      pending++;
      await upsertTracking(gameId,match.id,item.isoDate!,match.status||providerState,providerState,visitorScore,homeScore,"",now);
      details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:providerState,providerStatus:match.status||providerState,score:visitorScore===null||homeScore===null?undefined:`${visitorScore}-${homeScore}`});
      continue;
    }
    const existingResult=await env.DB.prepare("SELECT visitor_score AS visitorScore, home_score AS homeScore FROM game_results WHERE game_id = ?").bind(gameId).first<{visitorScore:number;homeScore:number}>();
    if(existingResult){
      if(existingResult.visitorScore===visitorScore&&existingResult.homeScore===homeScore){
        await confirmTracking(gameId,match,item.isoDate!,visitorScore,homeScore,tracking?.firstFinalAt||now.toISOString(),tracking?.confirmedAt||now.toISOString(),now);
        details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:"confirmed",providerStatus:"Final",score:`${visitorScore}-${homeScore}`});
      }else{
        errors++;
        await upsertTracking(gameId,match.id,item.isoDate!,"Final","review_required",visitorScore,homeScore,"El marcador del proveedor difiere del resultado registrado",now);
        details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:"review_required",providerStatus:"Final",score:`${visitorScore}-${homeScore}`,detail:"Difiere del resultado registrado"});
      }
      continue;
    }
    const sameObservation=tracking?.state==="awaiting_confirmation"&&tracking.observedVisitorScore===visitorScore&&tracking.observedHomeScore===homeScore&&Boolean(tracking.firstFinalAt);
    const elapsed=sameObservation?now.getTime()-new Date(tracking!.firstFinalAt).getTime():0;
    if(!sameObservation||elapsed<CONFIRMATION_DELAY_MS){
      awaitingConfirmation++;
      await observeFinal(gameId,match,item.isoDate!,visitorScore,homeScore,sameObservation?tracking!.firstFinalAt:now.toISOString(),now);
      details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:"awaiting_confirmation",providerStatus:"Final",score:`${visitorScore}-${homeScore}`,detail:"Pendiente de segunda lectura"});
      continue;
    }
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO game_results (game_id, visitor_score, home_score, updated_by_email, updated_by_name, updated_at) VALUES (?, ?, ?, 'system:balldontlie', 'Automatización de resultados', CURRENT_TIMESTAMP) ON CONFLICT(game_id) DO NOTHING`).bind(gameId,visitorScore,homeScore),
      env.DB.prepare(`INSERT INTO activity (square_id, action, actor_email, actor_name, actor_role, previous_status, new_status, details) VALUES (NULL, 'game_result_updated', 'system:balldontlie', 'Automatización de resultados', 'admin', '', '', ?)`).bind(`Juego ${gameId}: ${visitorScore}-${homeScore} · confirmado por BALLDONTLIE`),
    ]);
    await confirmTracking(gameId,match,item.isoDate!,visitorScore,homeScore,tracking!.firstFinalAt,now.toISOString(),now);
    confirmed++;
    details.push({gameId,matchup:`${item.game.visitor} vs ${item.game.home}`,state:"confirmed",providerStatus:"Final",score:`${visitorScore}-${homeScore}`,detail:"Resultado confirmado; flyers listos"});
  }
  return{status:errors?"error":"checked",message:confirmed?`${confirmed} resultado${confirmed===1?"":"s"} confirmado${confirmed===1?"":"s"}; flyers listos.`:awaitingConfirmation?"Marcador final detectado; esperando segunda confirmación.":"Seguimiento actualizado.",checked:candidates.length,confirmed,awaitingConfirmation,pending,errors,games:details};
}

async function upsertTracking(gameId:number,providerGameId:number|null,scheduledDate:string,providerStatus:string,state:string,visitorScore:number|null,homeScore:number|null,lastError:string,now:Date){
  await env.DB.prepare(`INSERT INTO nfl_result_tracking (game_id, provider_game_id, scheduled_date, provider_status, state, observed_visitor_score, observed_home_score, last_checked_at, last_error, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(game_id) DO UPDATE SET provider_game_id=excluded.provider_game_id, scheduled_date=excluded.scheduled_date, provider_status=excluded.provider_status, state=excluded.state, observed_visitor_score=excluded.observed_visitor_score, observed_home_score=excluded.observed_home_score, last_checked_at=excluded.last_checked_at, last_error=excluded.last_error, attempts=nfl_result_tracking.attempts+1`).bind(gameId,providerGameId,scheduledDate,providerStatus,state,visitorScore,homeScore,now.toISOString(),lastError).run();
}
async function observeFinal(gameId:number,match:ProviderGame,scheduledDate:string,visitorScore:number,homeScore:number,firstFinalAt:string,now:Date){
  await env.DB.prepare(`INSERT INTO nfl_result_tracking (game_id, provider_game_id, scheduled_date, provider_status, state, observed_visitor_score, observed_home_score, first_final_at, last_checked_at, last_error, attempts) VALUES (?, ?, ?, 'Final', 'awaiting_confirmation', ?, ?, ?, ?, '', 1) ON CONFLICT(game_id) DO UPDATE SET provider_game_id=excluded.provider_game_id, scheduled_date=excluded.scheduled_date, provider_status='Final', state='awaiting_confirmation', observed_visitor_score=excluded.observed_visitor_score, observed_home_score=excluded.observed_home_score, first_final_at=excluded.first_final_at, last_checked_at=excluded.last_checked_at, last_error='', attempts=nfl_result_tracking.attempts+1`).bind(gameId,match.id,scheduledDate,visitorScore,homeScore,firstFinalAt,now.toISOString()).run();
}
async function confirmTracking(gameId:number,match:ProviderGame,scheduledDate:string,visitorScore:number,homeScore:number,firstFinalAt:string,confirmedAt:string,now:Date){
  await env.DB.prepare(`INSERT INTO nfl_result_tracking (game_id, provider_game_id, scheduled_date, provider_status, state, observed_visitor_score, observed_home_score, first_final_at, confirmed_at, last_checked_at, last_error, attempts, flyers_ready) VALUES (?, ?, ?, 'Final', 'confirmed', ?, ?, ?, ?, ?, '', 1, 1) ON CONFLICT(game_id) DO UPDATE SET provider_game_id=excluded.provider_game_id, scheduled_date=excluded.scheduled_date, provider_status='Final', state='confirmed', observed_visitor_score=excluded.observed_visitor_score, observed_home_score=excluded.observed_home_score, first_final_at=excluded.first_final_at, confirmed_at=excluded.confirmed_at, last_checked_at=excluded.last_checked_at, last_error='', attempts=nfl_result_tracking.attempts+1, flyers_ready=1`).bind(gameId,match.id,scheduledDate,visitorScore,homeScore,firstFinalAt,confirmedAt,now.toISOString()).run();
}

function parseGames(value:string):Game[]{try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return[];}}
function numberOrNull(value:unknown){const result=Number(value);return Number.isInteger(result)&&result>=0?result:null;}
function sameTeam(a:string,b:string){return normalizeTeam(a)===normalizeTeam(b);}
function normalizeTeam(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function gameDateIso(value:string,seasonName:string){const match=value.trim().toLowerCase().match(/^(\d{1,2})\s+([a-záéíóú]{3})/);if(!match)return null;const months:Record<string,number>={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};const month=months[match[2]];if(!month)return null;const seasonYear=Number.parseInt(seasonName,10);if(!Number.isInteger(seasonYear))return null;const year=month<=2?seasonYear+1:seasonYear;return`${year}-${String(month).padStart(2,"0")}-${String(Number(match[1])).padStart(2,"0")}`;}
function addDays(iso:string,days:number){const [year,month,day]=iso.split("-").map(Number);const date=new Date(Date.UTC(year,month-1,day+days));return date.toISOString().slice(0,10);}
function localParts(date:Date){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(date);const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";return{date:`${get("year")}-${get("month")}-${get("day")}`,hour:Number(get("hour"))};}
function isTrackingWindow(gameDate:string,now:Date){const local=localParts(now);return(local.date===gameDate&&local.hour>=22)||(local.date===addDays(gameDate,1)&&local.hour<=4);}
