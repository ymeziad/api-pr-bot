"use client";
// Background Beams (Aceternity UI style, via 21st.dev): animated light beams travelling along curved paths.
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const PATHS = Array.from({ length: 14 }, (_, i) => {
  const o = i * 28;
  return `M${-380 + o} ${-189 - o * 0.6}C${-380 + o} ${-189 - o * 0.6} ${-312 + o} ${216 - o * 0.6} ${152 + o} ${343 - o * 0.6}C${616 + o} ${470 - o * 0.6} ${684 + o} ${875 - o * 0.6} ${684 + o} ${875 - o * 0.6}`;
});

export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg className="absolute h-full w-full" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">
        {PATHS.map((d, i) => (
          <path key={`base-${i}`} d={d} stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />
        ))}
        {PATHS.map((d, i) => (
          <motion.path
            key={`beam-${i}`}
            d={d}
            stroke={`url(#beam-grad-${i})`}
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
        ))}
        <defs>
          {PATHS.map((_, i) => (
            <motion.linearGradient
              id={`beam-grad-${i}`}
              key={`grad-${i}`}
              initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
              animate={{ x1: ["0%", "100%"], x2: ["0%", "95%"], y1: ["0%", "100%"], y2: ["0%", `${93 + Math.random() * 8}%`] }}
              transition={{ duration: 8 + ((i * 7) % 10), ease: "easeInOut", repeat: Infinity, delay: (i * 1.3) % 8 }}
            >
              <stop stopColor="#18CCFC" stopOpacity="0" />
              <stop stopColor="#18CCFC" />
              <stop offset="32.5%" stopColor="#6344F5" />
              <stop offset="100%" stopColor="#AE48FF" stopOpacity="0" />
            </motion.linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  );
}
