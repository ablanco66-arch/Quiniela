const ISSUER="https://token.actions.githubusercontent.com";
const JWKS_URL=`${ISSUER}/.well-known/jwks`;
const EXPECTED_AUDIENCE="https://quiniela-mnf-2026.ablanco66.chatgpt.site";
const EXPECTED_WORKFLOW="ablanco66-arch/Quiniela/.github/workflows/sync-nfl-results.yml@refs/heads/main";

type JwtHeader={alg?:string;kid?:string};
type JwtClaims={iss?:string;aud?:string|string[];exp?:number;nbf?:number;repository?:string;ref?:string;event_name?:string;workflow_ref?:string};

export async function verifyGitHubActionsToken(authorization:string|null){
  const token=authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)throw new Error("Falta la credencial OIDC");
  const parts=token.split(".");
  if(parts.length!==3)throw new Error("Credencial OIDC inválida");
  const header=parsePart<JwtHeader>(parts[0]);
  const claims=parsePart<JwtClaims>(parts[1]);
  if(header.alg!=="RS256"||!header.kid)throw new Error("Algoritmo OIDC no permitido");

  const jwksResponse=await fetch(JWKS_URL,{headers:{Accept:"application/json"}});
  if(!jwksResponse.ok)throw new Error("No se pudo validar la firma OIDC");
  const jwks=await jwksResponse.json() as {keys?:JsonWebKey[]};
  const jwk=jwks.keys?.find((candidate)=>candidate.kid===header.kid);
  if(!jwk)throw new Error("Firma OIDC desconocida");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,decodePart(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!valid)throw new Error("Firma OIDC inválida");

  const now=Math.floor(Date.now()/1000);
  const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==ISSUER||!audiences.includes(EXPECTED_AUDIENCE))throw new Error("Emisor o audiencia OIDC inválidos");
  if(!claims.exp||claims.exp<now||typeof claims.nbf==="number"&&claims.nbf>now+30)throw new Error("Credencial OIDC vencida o prematura");
  if(claims.repository!=="ablanco66-arch/Quiniela"||claims.ref!=="refs/heads/main"||claims.workflow_ref!==EXPECTED_WORKFLOW)throw new Error("Flujo de GitHub no autorizado");
  if(claims.event_name!=="schedule"&&claims.event_name!=="workflow_dispatch")throw new Error("Evento de GitHub no autorizado");
  return claims;
}

function parsePart<T>(value:string):T{return JSON.parse(new TextDecoder().decode(decodePart(value))) as T;}
function decodePart(value:string){
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  return Uint8Array.from(atob(normalized),(character)=>character.charCodeAt(0));
}
