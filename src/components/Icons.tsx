// Small SF-Symbols-like icon set (stroke icons, currentColor).
type P = { size?: number };
const S = ({ size = 24, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconToday = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></S>;
export const IconGym = (p: P) => <S {...p}><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></S>;
export const IconBody = (p: P) => <S {...p}><path d="M4 19h16M7 16l3-5 3 3 4-7" /></S>;
export const IconGear = (p: P) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></S>;
export const IconCheck = (p: P) => <S {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const IconDrop = (p: P) => <S {...p}><path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" /></S>;
export const IconFork = (p: P) => <S {...p}><path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 0-3 2.5-3 6s1 4 3 4v8" /></S>;
export const IconPill = (p: P) => <S {...p}><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)" /><path d="M9.5 9.5l5 5" /></S>;
export const IconScale = (p: P) => <S {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9a4 4 0 016 0l-3 3" /></S>;
export const IconMoon = (p: P) => <S {...p}><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></S>;
export const IconSpark = (p: P) => <S {...p}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" /></S>;
export const IconPerson = (p: P) => <S {...p}><circle cx="12" cy="7" r="3.5" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" /></S>;
export const IconBriefcase = (p: P) => <S {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" /></S>;
export const IconLock = (p: P) => <S {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></S>;
export const IconBack = (p: P) => <S {...p}><path d="M15 5l-7 7 7 7" /></S>;
export const IconFlame = (p: P) => <S {...p}><path d="M12 3c1 3 4 5 4 9a4 4 0 01-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z" /></S>;
export const IconCalendar = (p: P) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></S>;
export const IconClock = (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
export const IconSound = (p: P) => <S {...p}><path d="M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 010 6" /></S>;
