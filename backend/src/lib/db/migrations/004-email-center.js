export default {
  version: 4,
  name: "email-center",
  up(db) {
    db.run(`CREATE TABLE IF NOT EXISTS emailAccounts (id TEXT PRIMARY KEY, provider TEXT NOT NULL, email TEXT NOT NULL, name TEXT, accessToken TEXT, refreshToken TEXT, expiresAt TEXT, scope TEXT, isActive INTEGER DEFAULT 1, lastSyncAt TEXT, lastError TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
    db.run(`CREATE TABLE IF NOT EXISTS emailMessages (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerMessageId TEXT NOT NULL, threadId TEXT, folder TEXT DEFAULT 'inbox', fromAddress TEXT, fromName TEXT, toAddress TEXT, subject TEXT, snippet TEXT, body TEXT, isRead INTEGER DEFAULT 0, isStarred INTEGER DEFAULT 0, hasAttachment INTEGER DEFAULT 0, receivedAt TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_provider_id ON emailMessages(accountId, providerMessageId)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_email_messages_received ON emailMessages(receivedAt DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_email_messages_account_folder ON emailMessages(accountId, folder)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_email_accounts_provider ON emailAccounts(provider)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON emailAccounts(email)`);
  },
};
