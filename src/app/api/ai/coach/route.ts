// AI coach: analyses the user's own summarized data with Claude and answers in Thai.
// Needs GEMINI_API_KEY or ANTHROPIC_API_KEY (+ the Supabase service key to read app_state) in Vercel env.
import { aiSummary } from "@/lib/ai-summary";
import { logicalDate, wallClock } from "@/lib/date";
import { normalize } from "@/lib/model";
import { aiProvider, complete, type AiResult, type AiTurn } from "@/lib/server/ai";
import { admin, serverEnv } from "@/lib/server/push";
import { takeQuota } from "@/lib/server/quota";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 20;

// Frozen system prompt (no dates/IDs) so it stays cacheable across calls.
const SYSTEM = `คุณคือโค้ชส่วนตัวในแอป Krob สำหรับผู้ใช้คนเดียว นอนดึกตื่นบ่าย (ดูเวลาตื่น/นอนตามแผนใน summary) ใช้แผนรายวันแบบเทมเพลต บางวันอาจมีกะงาน 16:00-02:00 (ดูใน summary) กำลังเพิ่มน้ำหนัก/กล้ามเนื้อ เรียนร้องเพลง ทำเซิร์ฟเวอร์ Minecraft บันทึกวินัยการเทรด และเล่นเกมเป็นกิจกรรมหลักที่วางแผนไว้
ตอบเป็นภาษาไทย กระชับ อบอุ่น ตรงไปตรงมา อิงเฉพาะตัวเลขที่ได้รับ ห้ามแต่งข้อมูลที่ไม่มี
หลักที่ใช้: ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบ, พลาด 1 วันไม่เป็นไรแต่อย่าพลาด 2 วันติด, ผูกนิสัยกับเหตุการณ์ที่ทำอยู่แล้ว, ทำข้อเล็กให้ง่าย, ตัวตนนำพฤติกรรม
เรื่องเกม: เกมคือเวลาพักที่วางแผนไว้ ไม่ตำหนิเวลาเกมถ้าแกนสุขภาพ (มื้อ น้ำ นอน ยิม) ครบ ถ้านอนน้อยกว่า 7 ชม. หรือยิม/มื้อหลุด ให้แนะนำสลับเทมเพลตวันนั้น ไม่ใช่ห้ามเล่น
เรื่องการกิน: วันที่มีกะงาน มื้อใหญ่ก่อนเข้างาน กลางคืนกินเบา วันไม่มีงาน กิน 6 มื้อห่างกัน 2.5-4 ชม. มื้อใหญ่สุดท้ายก่อนนอนอย่างน้อย 2 ชม.
เรื่องเทรด: ประเมินเฉพาะวินัย (เช็กแผน, ไม่มีจังหวะไม่เข้า, ไม่เทรดเกินแผน) ห้ามแนะนำการซื้อขาย สินทรัพย์ หรือราคาใดๆ
เรื่องสุขภาพ: เป็นคำแนะนำทั่วไป ไม่ใช่การวินิจฉัย ถ้ามีสัญญาณผิดปกติรุนแรงให้แนะนำพบแพทย์
เรื่องร้องเพลง: แนะนำแบบระวัง เจ็บให้หยุด แหบเกิน 2 สัปดาห์ให้พบแพทย์หู คอ จมูก
รูปแบบ: หัวข้อสั้นๆ ตามด้วยบูลเล็ต "- " ไม่ใช้ตาราง ไม่ใช้อีโมจิ`;

const COACH_TASK = `วิเคราะห์ข้อมูลของฉันแล้วตอบตามหัวข้อนี้:
1. ภาพรวม (2-3 ประโยค)
2. สิ่งที่ทำได้ดี (2-3 ข้อ)
3. สิ่งที่ตรวจพบว่าน่าห่วง หรือ pattern ที่ซ่อนอยู่ (เช่น ความสัมพันธ์ระหว่างการนอน พลังงาน และความครบ, วันที่พลาดบ่อย, น้ำหนักขึ้นช้า/เร็ว)
4. แผน 3 ข้อสำหรับ 7 วันข้างหน้า แต่ละข้อทำได้จริง วัดผลได้ และบอกว่าปรับที่ไหนในแอป (เช่น ตั้งค่า > แผนประจำวัน)
5. ประโยคให้กำลังใจ 1 ประโยค (ถ้ามีเป้าหมายตัวตนในข้อมูล ให้ผูกกับเป้าหมายนั้น)`;

export async function POST(req: Request) {
  const { env } = serverEnv();
  if (!aiProvider()) return Response.json({ error: "missing env", missing: ["GEMINI_API_KEY"] }, { status: 500 });
  if (!env.url || !env.serviceKey) return Response.json({ error: "missing env", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });

  const db = admin();
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { mode?: "coach" | "ask"; question?: string; history?: unknown };
  const question = (body.question ?? "").trim().slice(0, 500);
  // Up to 2 earlier Q/A pairs (oldest first) so a follow-up like "แล้วควรทำยังไง" keeps its context.
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((h): h is { q: string; a: string } => !!h && typeof h === "object" && typeof (h as { q?: unknown }).q === "string" && typeof (h as { a?: unknown }).a === "string")
    .slice(-2)
    .map((h) => ({ q: h.q.trim().slice(0, 500), a: h.a.trim().slice(0, 1500) }))
    .filter((h) => h.q && h.a);
  if (body.mode === "ask" && !question) return Response.json({ error: "empty question" }, { status: 400 });

  const now = wallClock();
  const today = logicalDate(now);
  const { data: st } = await db.from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (!st) return Response.json({ error: "ยังไม่มีข้อมูลบน Supabase (ซิงค์ก่อน)" }, { status: 400 });
  const s = normalize(st.data);
  const summary = aiSummary(s, today);
  const identity = s.settings.aiSendIdentity && s.profile.identity ? `\nเป้าหมายตัวตน: ${s.profile.identity}` : "";

  // Daily cap shared with the brain (notification_log keys ai:*): reserved before the call, refunded on error.
  const q = await takeQuota(db, uid, today, `ai:coach:${Date.now()}`, { limit: DAILY_LIMIT });
  if (!q.ok) return q.error
    ? Response.json({ error: "เช็กโควตาไม่ได้ ลองใหม่" }, { status: 503 })
    : Response.json({ error: `ใช้ AI ครบ ${DAILY_LIMIT} ครั้งของวันนี้แล้ว` }, { status: 429 });

  // Earlier turns carry only the question; the data summary stays in the final user turn so it is always current.
  const turns: AiTurn[] = history.flatMap((h) => [{ role: "user" as const, text: h.q }, { role: "assistant" as const, text: h.a }]);
  turns.push({
    role: "user",
    text: `ข้อมูลของฉัน (สรุปเป็นตัวเลข):
${summary}${identity}

${body.mode === "ask" ? `คำถาม: ${question}
ตอบจากข้อมูลข้างบน ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าต้องบันทึกอะไรเพิ่ม` : COACH_TASK}`,
  });
  const r = await complete(SYSTEM, turns).catch((): AiResult => ({ error: "เชื่อมต่อ AI ไม่ได้", status: 502 }));
  if ("error" in r) { await q.refund(); return Response.json({ error: r.error }, { status: r.status }); }
  return Response.json({ ok: true, text: r.text, remaining: q.remaining });
}
