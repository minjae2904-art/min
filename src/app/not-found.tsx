import Link from "next/link";

export default function NotFound() {
  return (
    <main className="screen">
      <h1 className="large-title">ไม่พบหน้านี้</h1>
      <div className="subtitle">ลิงก์อาจเก่าหรือพิมพ์ผิด</div>
      <Link href="/" className="btn">กลับหน้าวันนี้</Link>
    </main>
  );
}
