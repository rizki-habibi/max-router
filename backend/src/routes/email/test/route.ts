import { listEmailAccounts, upsertEmailMessage } from "../../../lib/db/repos/emailRepo.js";

export async function POST_handler(req, res) {
  try {
    const accounts = (await listEmailAccounts()).filter((item) => item.isActive);
    if (!accounts.length) {
      return res.status(400).json({ ok: false, error: "Belum ada akun email yang terhubung." });
    }

    const requestedId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    const account = accounts.find((item) => item.id === requestedId) || accounts[0];
    const now = new Date();
    const messageId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subject = typeof req.body?.subject === "string" && req.body.subject.trim()
      ? req.body.subject.trim().slice(0, 160)
      : "Tes Pusat Email — pesan uji berhasil masuk";
    const body = typeof req.body?.body === "string" && req.body.body.trim()
      ? req.body.body.trim().slice(0, 5000)
      : `Ini pesan uji dari Max Router untuk memeriksa tampilan, pencarian, filter, dan notifikasi Pusat Email. Dibuat pada ${now.toLocaleString("id-ID")}.`;

    await upsertEmailMessage({
      accountId: account.id,
      providerMessageId: messageId,
      threadId: messageId,
      folder: "inbox",
      fromAddress: "test@max-router.local",
      fromName: "Max Router Test",
      toAddress: account.email,
      subject,
      snippet: body.slice(0, 220),
      body,
      isRead: false,
      isStarred: true,
      hasAttachment: false,
      receivedAt: now.toISOString(),
    });

    return res.json({
      ok: true,
      message: {
        account: account.email,
        provider: account.provider,
        providerMessageId: messageId,
        subject,
        receivedAt: now.toISOString(),
      },
    });
  } catch (e) {
    console.error("[email/test]", e);
    return res.status(500).json({ ok: false, error: e?.message || "Gagal membuat pesan uji." });
  }
}
