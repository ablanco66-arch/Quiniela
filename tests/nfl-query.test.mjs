import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=(await readFile(new URL('../lib/nfl-query.ts',import.meta.url),'utf8')).replace('import { env } from "cloudflare:workers";','const env = {BALLDONTLIE_API_KEY:"test-key"};');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {queryNflDate,validateNflDate}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('manual date query works outside tracking window, paginates, and never accesses the database',async()=>{
 const original=globalThis.fetch;let requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push(new URL(url));assert.equal(options.headers.Authorization,'test-key');
  return Response.json({data:[{id:requests.length,date:'2026-10-12',visitor_team:{full_name:'Visitor'},home_team:{full_name:'Home'},visitor_team_score:0,home_team_score:null,status:'Scheduled',status_state:'pre'}],meta:{next_cursor:requests.length===1?42:null}});
 };
 try{const result=await queryNflDate('2026-10-12');assert.equal(result.checked,2);assert.equal(result.games[0].visitorScore,0);assert.equal(result.games[0].homeScore,null);assert.equal(requests[0].searchParams.get('dates[]'),'2026-10-12');assert.equal(requests[1].searchParams.get('cursor'),'42');assert.equal(requests[0].searchParams.has('seasons[]'),false);}finally{globalThis.fetch=original;}
});
test('invalid dates fail before contacting provider',async()=>{
 for(const date of ['2026-02-30','2026-13-01','12/10/2026','',null])await assert.rejects(queryNflDate(date),/fecha válida/);
 assert.equal(validateNflDate('2028-02-29'),'2028-02-29');
});
test('empty results are successful; provider failures and malformed responses fail clearly',async()=>{
 const original=globalThis.fetch;
 try{
 globalThis.fetch=async()=>Response.json({data:[]});assert.equal((await queryNflDate('2026-10-12')).checked,0);
 globalThis.fetch=async()=>new Response('',{status:401});await assert.rejects(queryNflDate('2026-10-12'),/401/);
 globalThis.fetch=async()=>Response.json({});await assert.rejects(queryNflDate('2026-10-12'),/respuesta no válida/);
 }finally{globalThis.fetch=original;}
});
