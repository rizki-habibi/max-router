import { handleChat } from "../../../sse/handlers/chat.js";
import { initTranslators } from "../../../../open-sse/translator/index.js";

let initialized = false;

export async function POST_handler(req, res) {
  await ensureInitialized();
  const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const webReq = new Request(fullUrl, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
  });
  return await handleChat(webReq);
}

