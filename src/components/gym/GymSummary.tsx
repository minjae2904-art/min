"use client";

// Session summary after "จบ": time, sets, volume, and per exercise the top set with next time's hint.
import { Section, Sheet } from "@/components/ui";
import type { Summary } from "@/lib/gymlog";

export function GymSummary({ sum, ticked, onClose }: { sum: Summary | null; ticked: boolean; onClose: () => void }) {
  return (
    <Sheet open={!!sum} title={sum ? `สรุป ${sum.code} ${sum.label}` : "สรุปยิม"} onClose={onClose}>
      {sum && (
        <>
          <div className="sheet-meta num">{sum.min} นาที · {sum.sets} เซ็ต · ยกรวม {sum.vol.toLocaleString("en-US")} kg · {sum.reps} ครั้ง</div>
          <Section footer={ticked ? "ติ๊ก 'เข้ายิม' ในหน้าวันนี้แล้ว" : "บันทึกในประวัติยิมแล้ว"}>
            {sum.ex.map((e) => (
              <div key={e.id} className="row gs-row">
                <span className="row-main">
                  <span className="row-title">{e.name} <span className="num">{e.top}</span></span>
                  {e.hint && <span className="row-sub">{e.hint.text}</span>}
                </span>
                {e.pr && <span className="badge ok">สถิติใหม่</span>}
              </div>
            ))}
          </Section>
          <button type="button" className="btn" onClick={onClose}>เสร็จ</button>
        </>
      )}
    </Sheet>
  );
}
