import { listEmailAccounts } from "../../../lib/db/repos/emailRepo.js";
export async function GET_handler(req,res){ try { return res.json({accounts: await listEmailAccounts()}); } catch(e){ console.error("[email/accounts]",e); return res.status(500).json({error:"Gagal memuat akun email"}); } }
