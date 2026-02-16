import type { Database } from "bun:sqlite";
import { createSpeaker } from "./speakers.ts";
import { createChat } from "./chats.ts";
import { addMessage } from "./messages.ts";

/**
 * Seed the database with demo data.
 *
 * Creates a conversation tree:
 *   greeting (bot)
 *     └─ user_msg_1 (user)
 *          ├─ bot_reply_1 (bot)         ← branch point 1
 *          │    └─ user_msg_2 (user)
 *          │         └─ bot_reply_2 (bot)
 *          └─ bot_reply_1_alt (bot)
 *               └─ user_msg_2_alt (user)
 *                    ├─ bot_reply_2_alt (bot)  ← branch point 2
 *                    └─ bot_reply_2_alt2 (bot)
 */
export function seedDatabase(db: Database): void {
  // Create speakers
  const user = createSpeaker(db, { name: "User", is_user: true });
  const assistant = createSpeaker(db, {
    name: "Assistant",
    is_user: false,
    color: "#7c3aed",
  });

  // Create chat
  const chat = createChat(db, {
    name: "Welcome to Proseus",
    speaker_ids: [user.id, assistant.id],
  });

  // Build the message tree
  const greeting = addMessage(db, {
    chat_id: chat.id,
    parent_id: null,
    message:
      "Hello! Welcome to Proseus. I'm your AI assistant. How can I help you today?",
    speaker_id: assistant.id,
    is_bot: true,
  });

  const userMsg1 = addMessage(db, {
    chat_id: chat.id,
    parent_id: greeting.node.id,
    message: "Tell me about your features.",
    speaker_id: user.id,
    is_bot: false,
  });

  // Branch point 1: two replies to user_msg_1
  const botReply1 = addMessage(db, {
    chat_id: chat.id,
    parent_id: userMsg1.node.id,
    message:
      "Proseus features a branching conversation tree, fast SQLite storage, and a beautiful React UI. You can branch, swipe, and explore different conversation paths!",
    speaker_id: assistant.id,
    is_bot: true,
  });

  const userMsg2 = addMessage(db, {
    chat_id: chat.id,
    parent_id: botReply1.node.id,
    message: "That sounds great! How does branching work?",
    speaker_id: user.id,
    is_bot: false,
  });

  addMessage(db, {
    chat_id: chat.id,
    parent_id: userMsg2.node.id,
    message:
      "Every message is a node in a tree. When you regenerate or edit, a new sibling branch is created. You can navigate between branches freely!",
    speaker_id: assistant.id,
    is_bot: true,
  });

  // Alternate branch from user_msg_1
  const botReply1Alt = addMessage(db, {
    chat_id: chat.id,
    parent_id: userMsg1.node.id,
    message:
      "I'd be happy to help! Proseus is built for speed and flexibility. It uses a message tree architecture where every response is a branch you can explore.",
    speaker_id: assistant.id,
    is_bot: true,
  });

  const userMsg2Alt = addMessage(db, {
    chat_id: chat.id,
    parent_id: botReply1Alt.node.id,
    message: "Can you explain the tree structure more?",
    speaker_id: user.id,
    is_bot: false,
  });

  // Branch point 2: two replies to user_msg_2_alt
  addMessage(db, {
    chat_id: chat.id,
    parent_id: userMsg2Alt.node.id,
    message:
      "Sure! Each message has a parent and can have multiple children. The active path follows the active_child_index from root to leaf. Switching branches is just updating those indices.",
    speaker_id: assistant.id,
    is_bot: true,
  });

  addMessage(db, {
    chat_id: chat.id,
    parent_id: userMsg2Alt.node.id,
    message:
      "Think of it like a git history — each message is a commit, and branches are like git branches. You can explore any path without losing the others!",
    speaker_id: assistant.id,
    is_bot: true,
  });
}
