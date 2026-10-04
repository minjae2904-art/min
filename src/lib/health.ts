export type Profile = { name: string; birth: string; sex: "m" | "f"; heightCm: number; startKg: number; goalKg: number; setup: boolean };

// Personal values are entered on first run (Settings > โปรไฟล์), never hardcoded in the repo.
export const DEFAULT_PROFILE: Profile = { name: "", birth: "2000-01-01", sex: "m", heightCm: 175, startKg: 65, goalKg: 75, setup: false };

export function age(birth: string, now = new Date()): number {
  const b = new Date(birth + "T00:00:00");
  if (isNaN(b.getTime())) return 25;
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

// Mifflin-St Jeor
export function bmr(p: Profile, kg: number): number {
  return Math.round(10 * kg + 6.25 * p.heightCm - 5 * age(p.birth) + (p.sex === "m" ? 5 : -161));
}

export const bmi = (kg: number, cm: number) => kg / (cm / 100) ** 2;

// 35 ml/kg + 500 ml per gym hour + 750 ml per outdoor cardio/tennis hour
export function waterTargetMl(kg: number, gymHours: number, outdoorHours: number): number {
  return Math.round((kg * 35 + gymHours * 500 + outdoorHours * 750) / 50) * 50;
}

// Exponential moving average; smooths out 0.5-2 kg daily water swings.
export function trend(weights: { date: string; kg: number }[], alpha = 0.1): { date: string; kg: number; trend: number }[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  let t = sorted[0]?.kg ?? 0;
  return sorted.map((w) => ({ ...w, trend: (t = t + alpha * (w.kg - t)) }));
}

// Weight-gain targets used across the app (kcal ~ TDEE + 450, protein 2 g/kg).
export function targets(p: Profile, kg: number) {
  const tdee = Math.round(bmr(p, kg) * 1.65);
  return { tdee, kcal: Math.round((tdee + 450) / 50) * 50, protein: Math.round(kg * 2) };
}
