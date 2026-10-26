// Dictionary for src/lib/brain/context.ts (batch 4). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // context (src/lib/brain/context.ts): the user turn sent to the brain AI
  "context.userText": "data: {data}\nงาน: {task}",
  "context.task.brief": "สรุปวันนี้",
  "context.task.review": "ทบทวนสัปดาห์",
};

export const en: Tr<typeof th> = {
  "context.userText": "data: {data}\ntask: {task}",
  "context.task.brief": "Today's summary",
  "context.task.review": "Weekly review",
};
