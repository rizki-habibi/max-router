import { handleChat } from "../../../../sse/handlers/chat.js";
import { initTranslators } from "../../../../../open-sse/translator/index.js";
import { transformToOllama } from "../../../../../open-sse/utils/ollamaTransform.js";

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

export async function POST_handler(req, res) {
  await ensureInitialized();
  
  const clonedReq = req.clone ? req.clone() : new Request(`${req.protocol || 'http'}://${req.get?.('host') || 'localhost'}${req.originalUrl || req.url || '/'}`, { method: req.method, headers: new Headers(req.headers), body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined });
  let modelName = "llama3.2";
  try {
    const body = await clonedReq.json();
    modelName = body.model || "llama3.2";
  } catch {}

  const response = await handleChat(clonedReq);
  return transformToOllama(response, modelName);
}

