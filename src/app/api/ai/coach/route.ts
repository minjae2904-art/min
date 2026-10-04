// AI coach: analyses the user's own summarized data with Claude and answers in Thai.
// Needs GEMINI_API_KEY or ANTHROPIC_API_KEY (+ the Supabase service key to read app_state) in Vercel env.
import { aiSummary } from "@/lib/ai-summary";
import { logicalDate, wallClock } from "@/lib/date";
import { normalize } from "@/lib/model";
import { aiProvider, complete } from "@/lib/server/ai";
import { admin, serverEnv } from "@/lib/server/push";
import { verifyToken } from "@/lib/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = 20;

// Frozen system prompt (no dates/IDs) so it stays cacheable across calls.
const SYSTEM = `คุณคือโค้ชส่วนตัวในแอป Krob สำหรับผู้ใช้คนเดียวที่ทำงานกะดึก กำลังเพิ่มน้ำหนัก/กล้ามเนื้อ เข้ายิมหลังเลิกงาน ฝึกบุคลิกภาพ และบันทึกวินัยการเทรด
ตอบเป็นภาษาไทย กระชับ อบอุ่น ตรงไปตรงมา อิงเฉพาะตัวเลขที่ได้รับ ห้ามแต่งข้อมูลที่ไม่มี
หลักที่ใช้: ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบ, พลาด 1 วันไม่เป็นไรแต่อย่าพลาด 2 วันติด, ผูกนิสัยกับเหตุการณ์ที่ทำอยู่แล้ว, ทำข้อเล็กให้ง่าย, ตัวตนนำพฤติกรรม
เรื่องการกินกะดึก: มื้อใหญ่ช่วงกลางวัน กลางคืนกินเบา โปรตีนนำช่วงต้นกะ
เรื่องเทรด: ประเมินเฉพาะวินัย (เช็กแผน, ไม่มีจังหวะไม่เข้า, ไม่เทรดเกินแผน) ห้ามแนะนำการซื้อขาย สินทรัพย์ หรือราคาใดๆ
เรื่องสุขภาพ: เป็นคำแนะนำทั่วไป ไม่ใช่การวินิจฉัย ถ้ามีสัญญาณผิดปกติรุนแรงให้แนะนำพบแพทย์
รูปแบบ: หัวข้อสั้นๆ ตามด้วยบูลเล็ต "- " ไม่ใช้ตาราง ไม่ใช้อีโมจิ`;

const COACH_TASK = `วิเคราะห์ข้อมูลของฉันแล้วตอบตามหัวข้อนี้:
1. ภาพรวม (2-3 ประโยค)
2. สิ่งที่ทำได้ดี (2-3 ข้อ)
3. สิ่งที่ตรวจพบว่าน่าห่วง หรือ pattern ที่ซ่อนอยู่ (เช่น ความสัมพันธ์ระหว่างการนอน พลังงาน และความครบ, วันที่พลาดบ่อย, น้ำหนักขึ้นช้า/เร็ว)
4. แผน 3 ข้อสำหรับ 7 วันข้างหน้า แต่ละข้อทำได้จริง วัดผลได้ และบอกว่าปรับที่ไหนในแอป (เช่น ตั้งค่า > ตารางประจำวัน)
5. ประโยคให้กำลังใจ 1 ประโยคที่ผูกกับเป้าหมายตัวตน`;

export async function POST(req: Request) {
  const { env } = serverEnv();
  if (!aiProvider()) return Response.json({ error: "missing env", missing: ["GEMINI_API_KEY"] }, { status: 500 });
  if (!env.url || !env.serviceKey) return Response.json({ error: "missing env", missing: ["SUPABASE_SERVICE_ROLE_KEY"] }, { status: 500 });

  const db = admin();
  const uid = verifyToken(req);
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { mode?: "coach" | "ask"; question?: string };
  const question = (body.question ?? "").trim().slice(0, 500);
  if (body.mode === "ask" && !question) return Response.json({ error: "empty question" }, { status: 400 });

  const now = wallClock();
  const today = logicalDate(now);
  // Daily cap, counted in notification_log (keys ai:1, ai:2, ...). Skipped if the table is missing.
  const { count } = await db.from("notification_log").select("*", { head: true, count: "exact" }).eq("user_id", uid).eq("date", today).like("key", "ai:%");
  if ((count ?? 0) >= DAILY_LIMIT) return Response.json({ error: `ใช้ AI ครบ ${DAILY_LIMIT} ครั้งของวันนี้แล้ว` }, { status: 429 });

  const { data: st } = await db.from("app_state").select("data").eq("user_id", uid).maybeSingle();
  if (!st) return Response.json({ error: "ยังไม่มีข้อมูลบน Supabase (ซิงค์ก่อน)" }, { status: 400 });
  const s = normalize(st.data);
  const summary = aiSummary(s, today);
  const identity = s.profile.identity ? `\nเป้าหมายตัวตน: ${s.profile.identity}` : "";

  const r = await complete(SYSTEM, `ข้อมูลของฉัน (สรุปเป็นตัวเลข):
${summary}${identity}

${body.mode === "ask" ? `คำถาม: ${question}
ตอบจากข้อมูลข้างบน ถ้าข้อมูลไม่พอให้บอกตรงๆ ว่าต้องบันทึกอะไรเพิ่ม` : COACH_TASK}`);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  await db.from("notification_log").insert({ user_id: uid, date: today, key: `ai:${Date.now()}` });
  return Response.json({ ok: true, text: r.text });
}
