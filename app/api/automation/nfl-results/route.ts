import { verifyGitHubActionsToken } from "../../../../lib/github-oidc";
import { syncNflResults } from "../../../../lib/nfl-results";

export async function POST(request:Request){
  try{
    await verifyGitHubActionsToken(request.headers.get("authorization"));
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"No autorizado"},{status:401});
  }
  try{
    return Response.json(await syncNflResults());
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"Error al sincronizar resultados"},{status:500});
  }
}
