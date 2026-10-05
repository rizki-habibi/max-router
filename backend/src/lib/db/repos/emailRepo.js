import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";

function mapAccount(r) {
  if (!r) return null;
  return { id:r.id, provider:r.provider, email:r.email, name:r.name, isActive:r.isActive === 1 || r.isActive === true, lastSyncAt:r.lastSyncAt, lastError:r.lastError, createdAt:r.createdAt, updatedAt:r.updatedAt };
}
function mapMessage(r) { return { id:r.id, account_id:r.accountId, provider:r.provider, email_address:r.email, provider_message_id:r.providerMessageId, thread_id:r.threadId, folder:r.folder, from_address:r.fromAddress, from_name:r.fromName, to_address:r.toAddress, subject:r.subject, snippet:r.snippet, body:r.body, is_read:r.isRead === 1 || r.isRead === true, is_starred:r.isStarred === 1 || r.isStarred === true, has_attachment:r.hasAttachment === 1 || r.hasAttachment === true, received_at:r.receivedAt, created_at:r.createdAt }; }

export async function listEmailAccounts() { const db=await getAdapter(); const rows=await db.all("SELECT * FROM emailAccounts ORDER BY createdAt DESC"); return rows.map(mapAccount); }
export async function getEmailAccount(id) { const db=await getAdapter(); const r=await db.get("SELECT * FROM emailAccounts WHERE id = ?",[id]); return r; }
export async function upsertEmailAccount(data) {
  const db=await getAdapter(); const now=new Date().toISOString();
  const existing=await db.get("SELECT * FROM emailAccounts WHERE provider = ? AND email = ?",[data.provider,data.email]);
  const id=existing?.id || data.id || uuidv4();
  await db.run(`INSERT INTO emailAccounts(id,provider,email,name,accessToken,refreshToken,expiresAt,scope,isActive,lastSyncAt,lastError,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,accessToken=excluded.accessToken,refreshToken=excluded.refreshToken,expiresAt=excluded.expiresAt,scope=excluded.scope,isActive=excluded.isActive,lastError=excluded.lastError,updatedAt=excluded.updatedAt`,[id,data.provider,data.email,data.name||null,data.accessToken||null,data.refreshToken||null,data.expiresAt||null,data.scope||null,data.isActive===false?0:1,data.lastSyncAt||existing?.lastSyncAt||null,data.lastError||null,existing?.createdAt||now,now]);
  return getEmailAccount(id);
}
export async function updateEmailAccount(id,data) { const db=await getAdapter(); const now=new Date().toISOString(); const fields=Object.keys(data); if(!fields.length)return getEmailAccount(id); const sets=fields.map(k=>`${k} = ?`).join(", "); await db.run(`UPDATE emailAccounts SET ${sets}, updatedAt = ? WHERE id = ?`,[...fields.map(k=>data[k]),now,id]); return getEmailAccount(id); }
export async function listEmailMessages({folder="inbox",limit=200}={}) { const db=await getAdapter(); const rows=await db.all(`SELECT m.*, a.provider, a.email FROM emailMessages m JOIN emailAccounts a ON a.id=m.accountId WHERE m.folder = ? AND a.isActive = 1 ORDER BY m.receivedAt DESC LIMIT ?`,[folder,Math.min(Math.max(Number(limit)||200,1),500)]); return rows.map(mapMessage); }
export async function upsertEmailMessage(m) { const db=await getAdapter(); const now=new Date().toISOString(); const existing=await db.get("SELECT id FROM emailMessages WHERE accountId = ? AND providerMessageId = ?",[m.accountId,m.providerMessageId]); await db.run(`INSERT INTO emailMessages(id,accountId,providerMessageId,threadId,folder,fromAddress,fromName,toAddress,subject,snippet,body,isRead,isStarred,hasAttachment,receivedAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(accountId, providerMessageId) DO UPDATE SET threadId=excluded.threadId,folder=excluded.folder,fromAddress=excluded.fromAddress,fromName=excluded.fromName,toAddress=excluded.toAddress,subject=excluded.subject,snippet=excluded.snippet,body=excluded.body,isRead=excluded.isRead,isStarred=excluded.isStarred,hasAttachment=excluded.hasAttachment,receivedAt=excluded.receivedAt,updatedAt=excluded.updatedAt`,[m.id||uuidv4(),m.accountId,m.providerMessageId,m.threadId||null,m.folder||"inbox",m.fromAddress||null,m.fromName||null,m.toAddress||null,m.subject||null,m.snippet||null,m.body||null,m.isRead?1:0,m.isStarred?1:0,m.hasAttachment?1:0,m.receivedAt||now,now,now]); return { created: !existing }; }
export { mapMessage };
