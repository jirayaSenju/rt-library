import React from "react"
import { ProgressTheme } from "@/theme/progressThemes"
import { ScraperState } from "@/services/scraperService"
import { cn } from "@/lib/utils"

export type ProgressMascotSize = "sm" | "md" | "lg" | "card" | "preview" | "runtime"

export interface ProgressMascotProps {
  theme: ProgressTheme
  percent?: number | null
  state?: ScraperState
  isIndeterminate?: boolean
  size?: ProgressMascotSize
  isStatic?: boolean
  className?: string
}

export const ProgressMascot: React.FC<ProgressMascotProps> = ({
  theme,
  percent = null,
  state = "running",
  isIndeterminate = false,
  size = "sm",
  isStatic = false,
  className,
}) => {
  if (!theme || !theme.mascot) return null

  const isActuallyIndeterminate = isIndeterminate || percent === null
  const clampedPercent = percent !== null ? Math.min(100, Math.max(0, percent)) : 0

  const isCompleted = state === "completed"
  const isFailed = state === "failed"
  const isCancelling = state === "cancelling"
  const isAttention = state === "session_required" || state === "interaction_required"

  // Select motion animation class based on active scraper state and isStatic prop
  const getMotionClass = () => {
    if (isStatic || isFailed) return ""
    if (isCompleted) return "animate-mascot-celebrate"
    if (isCancelling) return "animate-pulse opacity-70"
    if (isAttention) return "animate-pulse"
    if (isActuallyIndeterminate) {
      return theme.motion?.indeterminateClass || "animate-mascot-indeterminate-sweep"
    }
    return theme.motion?.animationClass || "animate-mascot-bounce"
  }

  const motionClass = getMotionClass()
  const isGlyph = theme.mascot.type === "glyph"
  const normalizedSize = size === "card" ? "sm" : size === "preview" ? "md" : size === "runtime" ? "lg" : size

  const sizeConfigs = {
    sm: {
      badgeClass: "w-5 h-5 text-xs",
      glyphClass: "text-[10px] font-mono font-bold tracking-tight px-0.5",
      offset: 10,
      total: 20,
    },
    md: {
      badgeClass: "w-7 h-7 text-base",
      glyphClass: "text-xs font-mono font-bold tracking-tight px-1",
      offset: 14,
      total: 28,
    },
    lg: {
      badgeClass: "w-[30px] h-[30px] text-lg",
      glyphClass: "text-sm font-mono font-bold tracking-tight px-1",
      offset: 15,
      total: 30,
    },
  }

  const currentSize = sizeConfigs[normalizedSize] || sizeConfigs.sm
  const trailType = theme.mascot.trail || "none"
  const showTrail = !isStatic && !isFailed && !isCompleted && !isCancelling && !isAttention && trailType !== "none"

  return (
    <div
      aria-hidden="true"
      data-mascot={theme.mascot.name}
      data-mascot-type={theme.mascot.type}
      data-motion-type={theme.motion.type}
      data-mascot-size={normalizedSize}
      data-trail-type={trailType}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 select-none pointer-events-none z-20 flex items-center justify-center transition-all duration-300",
        isActuallyIndeterminate && "w-full left-0 right-0 overflow-hidden pointer-events-none",
        isFailed && "grayscale opacity-60",
        className
      )}
      style={
        !isActuallyIndeterminate
          ? {
              left: `clamp(0px, calc(${clampedPercent}% - ${currentSize.offset}px), calc(100% - ${currentSize.total}px))`,
            }
          : undefined
      }
    >
      {/* Optional Animated Trail behind mascot */}
      {showTrail && (
        <>
          {trailType === "rainbow" && (
            <span className="absolute right-[65%] top-1/2 -translate-y-1/2 w-4 h-2.5 rounded-l-full bg-gradient-to-r from-transparent via-pink-500/70 to-yellow-400/80 animate-trail-rainbow pointer-events-none -z-10" />
          )}
          {trailType === "pixel" && (
            <span className="absolute right-[75%] top-1/2 -translate-y-1/2 flex gap-0.5 animate-trail-pixel pointer-events-none -z-10">
              <span className="w-1 h-1 bg-emerald-400/80 rounded-2xs" />
              <span className="w-1 h-1 bg-cyan-400/50 rounded-2xs" />
            </span>
          )}
          {trailType === "bubble" && (
            <span className="absolute right-[75%] top-1/2 -translate-y-1/2 flex gap-0.5 items-center animate-trail-bubble pointer-events-none -z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70" />
              <span className="w-1 h-1 rounded-full bg-teal-400/50" />
            </span>
          )}
          {trailType === "spark" && (
            <span className="absolute right-[75%] top-1/2 -translate-y-1/2 flex items-center animate-trail-spark pointer-events-none -z-10">
              <span className="w-1.5 h-1.5 rotate-45 bg-amber-300/80 shadow-[0_0_4px_#facc15]" />
            </span>
          )}
          {trailType === "star" && (
            <span className="absolute right-[70%] top-1/2 -translate-y-1/2 w-4 h-2.5 rounded-l-full bg-gradient-to-r from-transparent via-purple-500/60 to-cyan-400/80 animate-trail-spark pointer-events-none -z-10" />
          )}
          {trailType === "glow" && (
            <span className="absolute right-[65%] top-1/2 -translate-y-1/2 w-3.5 h-2 rounded-l-full bg-primary/40 blur-[2px] pointer-events-none -z-10" />
          )}
        </>
      )}

      {/* Mascot Badge / Backplate */}
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border transition-transform leading-none shrink-0 shadow-md backdrop-blur-xs",
          "bg-background/90 dark:bg-black/85 border-border/80",
          currentSize.badgeClass,
          isGlyph && currentSize.glyphClass,
          motionClass
        )}
        style={{
          backgroundColor: theme.mascot.backplateBg || (isGlyph ? theme.trackBg || "rgba(15, 23, 42, 0.9)" : "rgba(15, 23, 42, 0.85)"),
          borderColor: theme.mascot.backplateBorder || theme.trackBorder || "rgba(255, 255, 255, 0.3)",
          color: isGlyph && theme.textColor ? theme.textColor : undefined,
          boxShadow: theme.mascot.glow
            ? `${theme.mascot.glow}, 0 2px 6px rgba(0, 0, 0, 0.6)`
            : theme.glow
            ? `${theme.glow}, 0 2px 6px rgba(0, 0, 0, 0.6)`
            : "0 2px 6px rgba(0, 0, 0, 0.6)",
          textShadow: theme.mascot.glow ? `0 0 6px ${theme.mascot.backplateBorder || "currentColor"}` : undefined,
        }}
      >
        {theme.mascot.value}
      </span>
    </div>
  )
}
