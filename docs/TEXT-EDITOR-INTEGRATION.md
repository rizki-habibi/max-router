# Integrasi Max Router ke Text Editor

Max Router menyediakan API OpenAI-compatible sehingga editor yang mendukung OpenAI-compatible provider dapat langsung menggunakannya.

## Endpoint

- Base URL: `https://DOMAIN-MAX-ROUTER/v1`
- Models: `GET /v1/models`
- Chat: `POST /v1/chat/completions`

## Model Antigravity

Gunakan provider prefix agar routing eksplisit:

```
ag/claude-opus-4-6-thinking
```

Model Antigravity lain:

```
ag/claude-sonnet-4-6
ag/gemini-pro-agent
ag/gemini-3.1-pro-low
ag/gemini-3-flash
ag/gpt-oss-120b-medium
```

## Contoh OpenAI SDK

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://DOMAIN-MAX-ROUTER/v1",
  apiKey: process.env.MAX_ROUTER_API_KEY,
});

const response = await client.chat.completions.create({
  model: "ag/claude-opus-4-6-thinking",
  messages: [
    { role: "user", content: "Bantu periksa kode ini." }
  ],
  stream: true,
});

for await (const chunk of response) {
  process.stdout.write(chunk.choices?.[0]?.delta?.content || "");
}
```

## Cursor / Continue / editor OpenAI-compatible

- Provider: OpenAI Compatible
- Base URL: `https://DOMAIN-MAX-ROUTER/v1`
- API Key: API key Max Router
- Model: `ag/claude-opus-4-6-thinking`

## Catatan 403 #3501

HTTP 403 dengan `#3501`, `SUBSCRIPTION_REQUIRED`, atau `You do not have a valid license of this product` berasal dari entitlement Antigravity upstream. Max Router menandainya sebagai `licenseError` dan tidak boleh memperlakukannya sebagai quota reset atau melakukan OAuth refresh berulang.

Credential Google tetap harus memiliki akses Antigravity yang sah. Dokumen ini tidak mengubah atau melewati pemeriksaan entitlement.

## Diagnosis

Sebelum memasang model ke editor, cek:

```text
GET https://DOMAIN-MAX-ROUTER/v1/models
```

Pastikan model `ag/claude-opus-4-6-thinking` muncul. Jika model muncul tetapi request menghasilkan 403 #3501, masalah berada pada entitlement/akses koneksi Antigravity, bukan konfigurasi Base URL editor.

