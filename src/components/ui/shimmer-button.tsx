"use client";
// Shimmer Button (Magic UI style, via 21st.dev): a light sweep spins around the button border.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  background?: string;
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ shimmerColor = "#a5b4fc", background = "linear-gradient(135deg,#4f46e5,#7c3aed)", className, children, style, ...props }, ref) => (
    <button
      ref={ref}
      style={{ ["--shimmer" as string]: shimmerColor, ["--bg" as string]: background, ...style }}
      className={cn(
        "group relative z-0 inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3 font-medium text-white",
        "[background:var(--bg)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
        className,
      )}
      {...props}
    >
      <span className="absolute inset-0 -z-10 overflow-hidden rounded-xl">
        <span className="absolute inset-[-100%] animate-[shimmer-spin_3s_linear_infinite] [background:conic-gradient(from_0deg,transparent_0_300deg,var(--shimmer)_360deg)]" />
      </span>
      <span className="absolute inset-[1.5px] -z-10 rounded-[10px] [background:var(--bg)]" />
      <span className="absolute inset-0 -z-10 rounded-xl shadow-[inset_0_-8px_10px_#ffffff1f] transition-shadow group-hover:shadow-[inset_0_-6px_10px_#ffffff3f]" />
      {children}
    </button>
  ),
);
ShimmerButton.displayName = "ShimmerButton";
