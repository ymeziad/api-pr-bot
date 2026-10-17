"use client";
// Number Ticker (Magic UI style, via 21st.dev): springs from the previous value to the new one.
import { useEffect, useRef } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

export function NumberTicker({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { damping: 40, stiffness: 120 });

  useEffect(() => { mv.set(value); }, [mv, value]);
  useEffect(
    () => spring.on("change", (v) => { if (ref.current) ref.current.textContent = String(Math.round(v)); }),
    [spring],
  );

  return <span ref={ref} className={cn("inline-block tabular-nums", className)}>0</span>;
}
