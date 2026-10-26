"use client";

import { RingStack } from "@/components/Charts";

// Apple Fitness style activity rings, now drawn by the shared RingStack primitive (same API and timing as v1.x).
export function Rings({ values, size = 120 }: { values: [number, number, number]; size?: number }) {
  return <RingStack values={values} size={size} />;
}
