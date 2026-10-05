import crypto from "node:crypto";
import { getAdapter } from "../../../../../../lib/db/driver.js";

export async function GET_handler(req,res){
  const clientId=process.env.GOOGLE_CLIENT_ID;
  if(!clientId) return res.status(503).json({error:"GOOGLE_CLIENT_ID belum dikonfigurasi di server"});
  const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  const redirectUri=`${base}/api/email/oauth/gmail/callback`;
  const state=crypto.randomBytes(32).toString("hex");
  const db=await getAdapter();
  await db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value",["emailOAuth",state,JSON.stringify({provider:"gmail",redirectUri,createdAt:Date.now()})]);
  const p=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:"code",scope:"https://www.googleapis.com/auth/gmail.readonly openid email",access_type:"offline",prompt:"consent",state});
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`);
}
