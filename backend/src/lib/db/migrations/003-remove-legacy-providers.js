// Remove legacy built-in provider connections and their provider-scoped history.
// Compatible provider nodes are intentionally preserved.
export default {
  version: 3,
  name: "remove-legacy-provider-services",
  up(db) {
    const providers = [
      "claude", "antigravity", "codex", "github", "cursor", "xai",
      "kimi-coding", "kilocode", "cline",
      "kiro", "gemini-cli", "codebuddy", "qoder", "opencode",
      "openrouter", "nvidia", "ollama", "vertex", "gemini",
      "cloudflare-ai", "byteplus",
      "alicode", "alibaba-intl", "anthropic", "azure", "blackbox",
      "cerebras", "chutes", "cohere", "command-code", "deepseek",
      "fireworks", "glm", "glm-cn", "groq", "hyperbolic", "kimi",
      "minimax", "minimax-cn", "mistral", "nebius",
      "grok-web", "perplexity-web", "leonardo",
    ];

    const placeholders = providers.map(() => "?").join(", ");
    const params = providers;

    // Keep custom OpenAI/Anthropic-compatible providerNodes untouched.
    db.run(
      `DELETE FROM providerConnections WHERE provider IN (${placeholders})`,
      params,
    );

    // Remove historical request/usage rows belonging to deleted providers.
    db.run(
      `DELETE FROM usageHistory WHERE provider IN (${placeholders})`,
      params,
    );
    db.run(
      `DELETE FROM requestDetails WHERE provider IN (${placeholders})`,
      params,
    );

    // CodeBuddy has additional provider-specific automation tables.
    db.run("DELETE FROM codebuddyAccounts WHERE provider = ?", ["codebuddy"]);
    db.run("DELETE FROM codebuddyJobs");
  },
};
