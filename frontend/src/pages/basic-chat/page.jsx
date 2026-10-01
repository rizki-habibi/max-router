import BasicChatPageClient from "./BasicChatPageClient";
import ChatWorkspaceShell from "./ChatWorkspaceShell";

export default function BasicChatPage() {
  return <ChatWorkspaceShell><BasicChatPageClient /></ChatWorkspaceShell>;
}