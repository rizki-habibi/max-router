import { listEmailAccounts, updateEmailAccount, upsertEmailMessage } from "../../lib/db/repos/emailRepo.js";

function header(headers,name){ return headers?.find(h=>h.name?.toLowerCase()===name.toLowerCase())?.value||""; }
function decode(data){ if(!data)return ""; try{return Buffer.from(data.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8")}catch{return ""} }
function extractBody(part){ if(!part)return ""; if(part.body?.data)return decode(part.body.data); for(const p of part.parts||[]){const v=extractBody(p);if(v)return v;} return ""; }
async function api(url,token,options={}){const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}}); const t=await r.text(); let d={};try{d=JSON.parse(t)}catch{} if(!r.ok) {const e=new Error(d.error?.message||d.error_description||t||`HTTP ${r.status}`);e.status=r.status;throw e;} return d;}
async function tokenFor(account){
 if(account.expiresAt && Date.parse(account.expiresAt)>Date.now()+60000)return account.accessToken;
 if(!account.refreshToken) return account.accessToken;
 const body=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||"",client_secret:process.env.GOOGLE_CLIENT_SECRET||"",refresh_token:account.refreshToken,grant_type:"refresh_token"});
 const d=await api("https://oauth2.googleapis.com/token",null,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
 await updateEmailAccount(account.id,{accessToken:d.access_token,expiresAt:new Date(Date.now()+(d.expires_in||3600)*1000).toISOString(),lastError:null});
 return d.access_token;
}
export async function POST_handler(req,res){
 let synced=0,failed=0; const results=[];
 try{
  const accounts=(await listEmailAccounts()).filter(a=>a.provider==="gmail"&&a.isActive);
  for(const account of accounts){
   try{
    const token=await tokenFor(await (async()=>{const {getAdapter}=await import("../../lib/db/driver.js");return await getAdapter().then(db=>db.get("SELECT * FROM emailAccounts WHERE id = ?",[account.id]));})());
    const list=await api("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=in%3Ainbox",token);
    for(const item of list.messages||[]){
      const full=await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`,token); const h=full.payload?.headers||[];
      const labels=full.labelIds||[];
      await upsertEmailMessage({accountId:account.id,providerMessageId:full.id,threadId:full.threadId,folder:labels.includes("SPAM")?"spam":labels.includes("TRASH")?"trash":labels.includes("SENT")?"sent":labels.includes("STARRED")?"starred":"inbox",fromAddress:header(h,"From").match(/<([^>]+)>/)?.[1]||header(h,"From"),fromName:header(h,"From").replace(/<[^>]+>/,"").trim(),toAddress:header(h,"To"),subject:header(h,"Subject"),snippet:full.snippet,body:extractBody(full.payload),isRead:!labels.includes("UNREAD"),isStarred:labels.includes("STARRED"),hasAttachment:(full.payload?.parts||[]).some(p=>p.filename),receivedAt:full.internalDate?new Date(Number(full.internalDate)).toISOString():new Date().toISOString()}); synced++;
    }
    await updateEmailAccount(account.id,{lastSyncAt:new Date().toISOString(),lastError:null}); results.push({email:account.email,status:"ok",count:list.messages?.length||0});
   }catch(e){failed++;await updateEmailAccount(account.id,{lastError:e.message||"Gagal sinkronisasi"});results.push({email:account.email,status:"error",error:e.message||"Gagal sinkronisasi"});}
  }
  return res.json({ok:true,synced,failed,results});
 }catch(e){console.error("[email/sync]",e);return res.status(500).json({error:e.message||"Gagal sinkronisasi email",synced,failed,results});}
}
