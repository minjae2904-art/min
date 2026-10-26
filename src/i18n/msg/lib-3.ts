// Dictionary for src/lib/share.ts, src/lib/term.ts (batch 3). th = original strings byte-for-byte (never rephrase);
// en = English copy (spec section 3). One key per line; en keeps the key order of th.
import type { Tr } from "../core";

export const th = {
  // share (src/lib/share.ts): weekly share card tiles
  "share.tile.band": "วันที่ดี",
  "share.tile.live": "ไลฟ์",
  "share.tile.gym": "ยิม",
  "share.tile.weight": "น้ำหนัก",
  "share.tile.sleep": "นอนเฉลี่ย",
  "share.unit.days": "วัน",
  "share.unit.h": "ชม.",
  "share.unit.gymOne": "ครั้ง",
  "share.unit.gym": "ครั้ง",
  // term (src/lib/term.ts)
  "term.room": "ห้อง {room}",
};

export const en: Tr<typeof th> = {
  "share.tile.band": "Good days",
  "share.tile.live": "Live",
  "share.tile.gym": "Gym",
  "share.tile.weight": "Weight",
  "share.tile.sleep": "Avg sleep",
  "share.unit.days": "days",
  "share.unit.h": "h",
  "share.unit.gymOne": "day",
  "share.unit.gym": "days",
  "term.room": "Room {room}",
};
