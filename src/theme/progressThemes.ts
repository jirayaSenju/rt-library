export type ProgressThemeId =
  | "nyan-cat"
  | "claude-code"
  | "matrix-rain"
  | "synthwave"
  | "arcade-pixel"
  | "lava-lamp"
  | "rainbow-pop"
  | "ocean-wave"
  | "candy-rush"
  | "cosmic-nebula"
  | "soviet"

export type ProgressDecorationType = "none" | "rainbow" | "scanline" | "cat-marker" | "glow" | "pixel-blocks"

export type MascotType = "emoji" | "glyph" | "css-shape" | "icon"
export type MotionType = "float" | "bounce" | "pulse" | "wave" | "scan" | "glide" | "step" | "none"
export type TrailType = "none" | "rainbow" | "spark" | "bubble" | "pixel" | "scan" | "star" | "smoke" | "glow"
export type AnimationIntensity = "subtle" | "normal" | "playful"

export interface ProgressMascotConfig {
  type: MascotType
  value: string
  name: string
  position?: "progress-edge"
  glow?: string
  backplate?: boolean
  backplateBg?: string
  backplateBorder?: string
  trail?: TrailType
}

export interface ProgressMotionConfig {
  type: MotionType
  duration?: number
  intensity?: AnimationIntensity
  animationClass?: string
  indeterminateClass?: string
}

export interface ProgressTheme {
  id: ProgressThemeId
  name: string
  description: string
  trackBg: string
  trackBorder?: string
  fillBackground: string
  fillBackgroundSize?: string
  glow?: string
  textColor?: string
  hasAnimation?: boolean
  animationClass?: string
  marker?: "cat" | null
  mascot: ProgressMascotConfig
  motion: ProgressMotionConfig
  decoration?: ProgressDecorationType
  isDefault?: boolean
}

export const DEFAULT_PROGRESS_THEME_ID: ProgressThemeId = "nyan-cat"

export const PROGRESS_THEMES: Record<ProgressThemeId, ProgressTheme> = {
  "nyan-cat": {
    id: "nyan-cat",
    name: "Nyan Cat",
    description: "Rainbow animated gradient with a playful cat mascot and rainbow trail at progress edge.",
    trackBg: "#0d1020",
    trackBorder: "rgba(51, 153, 255, 0.4)",
    fillBackground: "linear-gradient(90deg, #ff0000, #ff9900, #ffff00, #33cc33, #3399ff, #6633cc)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 10px rgba(51, 204, 51, 0.45)",
    textColor: "#ffffff",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: "cat",
    mascot: {
      type: "emoji",
      value: "🐱",
      name: "Cat",
      position: "progress-edge",
      glow: "0 0 12px rgba(255, 105, 180, 0.8), 0 0 6px rgba(51, 204, 51, 0.6)",
      backplate: true,
      backplateBg: "rgba(13, 16, 32, 0.85)",
      backplateBorder: "rgba(255, 105, 180, 0.5)",
      trail: "rainbow",
    },
    motion: {
      type: "bounce",
      duration: 800,
      intensity: "playful",
      animationClass: "animate-mascot-bounce",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "cat-marker",
    isDefault: true,
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    description: "Warm amber terminal aesthetic inspired by an elegant coding assistant.",
    trackBg: "#241f1a",
    trackBorder: "rgba(217, 119, 87, 0.35)",
    fillBackground: "linear-gradient(90deg, #d97757, #f4b183)",
    glow: "0 0 8px rgba(217, 119, 87, 0.4)",
    textColor: "#f3ede7",
    hasAnimation: false,
    marker: null,
    mascot: {
      type: "glyph",
      value: ">_",
      name: "Prompt",
      position: "progress-edge",
      glow: "0 0 12px rgba(217, 119, 87, 0.8), 0 0 4px rgba(244, 177, 131, 0.6)",
      backplate: true,
      backplateBg: "rgba(36, 31, 26, 0.9)",
      backplateBorder: "rgba(217, 119, 87, 0.6)",
      trail: "none",
    },
    motion: {
      type: "pulse",
      duration: 1000,
      intensity: "normal",
      animationClass: "animate-mascot-claude-blink",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "matrix-rain": {
    id: "matrix-rain",
    name: "Matrix Rain",
    description: "Digital green hacker theme with phosphor glow and scanline atmosphere.",
    trackBg: "#07130b",
    trackBorder: "rgba(0, 255, 102, 0.35)",
    fillBackground: "linear-gradient(90deg, #00ff66, #33ff99)",
    glow: "0 0 8px rgba(0, 255, 102, 0.5)",
    textColor: "#b7ffd0",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "glyph",
      value: "▣",
      name: "Digital Bot",
      position: "progress-edge",
      glow: "0 0 14px rgba(0, 255, 102, 0.9), 0 0 6px rgba(51, 255, 153, 0.6)",
      backplate: true,
      backplateBg: "rgba(7, 19, 11, 0.9)",
      backplateBorder: "rgba(0, 255, 102, 0.6)",
      trail: "pixel",
    },
    motion: {
      type: "scan",
      duration: 1200,
      intensity: "normal",
      animationClass: "animate-mascot-matrix-scan",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "scanline",
  },
  "synthwave": {
    id: "synthwave",
    name: "Synthwave",
    description: "80s retro-futuristic neon gradient of hot pink, purple, and electric cyan.",
    trackBg: "#1a0b2e",
    trackBorder: "rgba(255, 0, 127, 0.4)",
    fillBackground: "linear-gradient(90deg, #ff007f, #b000ff, #00f0ff)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 10px rgba(255, 0, 127, 0.45)",
    textColor: "#f8f5ff",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "glyph",
      value: "▲",
      name: "Neon Vector",
      position: "progress-edge",
      glow: "0 0 14px rgba(255, 0, 127, 0.85), 0 0 6px rgba(0, 240, 255, 0.8)",
      backplate: true,
      backplateBg: "rgba(26, 11, 46, 0.9)",
      backplateBorder: "rgba(255, 0, 127, 0.6)",
      trail: "glow",
    },
    motion: {
      type: "glide",
      duration: 1000,
      intensity: "playful",
      animationClass: "animate-mascot-synthwave-tilt",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "arcade-pixel": {
    id: "arcade-pixel",
    name: "Arcade Pixel",
    description: "Retro videogame HUD aesthetic with segmented pixel-block visual.",
    trackBg: "#0f172a",
    trackBorder: "#38bdf8",
    fillBackground: "repeating-linear-gradient(90deg, #38bdf8 0px, #38bdf8 6px, transparent 6px, transparent 8px)",
    glow: "0 0 6px rgba(56, 189, 248, 0.4)",
    textColor: "#e0f2fe",
    hasAnimation: false,
    marker: null,
    mascot: {
      type: "emoji",
      value: "👾",
      name: "Pixel Invader",
      position: "progress-edge",
      glow: "0 0 12px rgba(56, 189, 248, 0.8), 0 0 4px rgba(14, 165, 233, 0.6)",
      backplate: true,
      backplateBg: "rgba(15, 23, 42, 0.9)",
      backplateBorder: "rgba(56, 189, 248, 0.6)",
      trail: "pixel",
    },
    motion: {
      type: "step",
      duration: 600,
      intensity: "playful",
      animationClass: "animate-mascot-step",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "pixel-blocks",
  },
  "lava-lamp": {
    id: "lava-lamp",
    name: "Lava Lamp",
    description: "Warm incandescent molten magma gradient of crimson, orange, and gold.",
    trackBg: "#1a0808",
    trackBorder: "rgba(234, 88, 12, 0.4)",
    fillBackground: "linear-gradient(90deg, #991b1b, #ea580c, #facc15)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 8px rgba(234, 88, 12, 0.45)",
    textColor: "#fef08a",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "emoji",
      value: "🔥",
      name: "Lava Blob",
      position: "progress-edge",
      glow: "0 0 12px rgba(234, 88, 12, 0.85), 0 0 6px rgba(250, 204, 21, 0.7)",
      backplate: true,
      backplateBg: "rgba(26, 8, 8, 0.9)",
      backplateBorder: "rgba(234, 88, 12, 0.6)",
      trail: "bubble",
    },
    motion: {
      type: "float",
      duration: 1400,
      intensity: "normal",
      animationClass: "animate-mascot-lava-bob",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "rainbow-pop": {
    id: "rainbow-pop",
    name: "Rainbow Pop",
    description: "Vibrant and cheerful modern multicolor gradient with smooth flow.",
    trackBg: "#18181b",
    trackBorder: "rgba(255, 255, 255, 0.25)",
    fillBackground: "linear-gradient(90deg, #f43f5e, #fb923c, #facc15, #4ade80, #38bdf8, #a855f7)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 8px rgba(56, 189, 248, 0.35)",
    textColor: "#ffffff",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "emoji",
      value: "✨",
      name: "Sparkle",
      position: "progress-edge",
      glow: "0 0 14px rgba(244, 63, 94, 0.75), 0 0 8px rgba(56, 189, 248, 0.75)",
      backplate: true,
      backplateBg: "rgba(24, 24, 27, 0.85)",
      backplateBorder: "rgba(250, 204, 21, 0.6)",
      trail: "spark",
    },
    motion: {
      type: "float",
      duration: 1000,
      intensity: "playful",
      animationClass: "animate-mascot-sparkle-rotate",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "rainbow",
  },
  "ocean-wave": {
    id: "ocean-wave",
    name: "Ocean Wave",
    description: "Calm fluid gradient of deep sapphire, cyan, and refreshing aqua waves.",
    trackBg: "#041e3a",
    trackBorder: "rgba(45, 212, 191, 0.4)",
    fillBackground: "linear-gradient(90deg, #0369a1, #06b6d4, #2dd4bf)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 8px rgba(45, 212, 191, 0.35)",
    textColor: "#ccfbf1",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "emoji",
      value: "🐟",
      name: "Fish",
      position: "progress-edge",
      glow: "0 0 12px rgba(45, 212, 191, 0.8), 0 0 6px rgba(6, 182, 212, 0.6)",
      backplate: true,
      backplateBg: "rgba(4, 30, 58, 0.9)",
      backplateBorder: "rgba(45, 212, 191, 0.6)",
      trail: "bubble",
    },
    motion: {
      type: "wave",
      duration: 1200,
      intensity: "normal",
      animationClass: "animate-mascot-swim",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "candy-rush": {
    id: "candy-rush",
    name: "Candy Rush",
    description: "Playful sweet confectionery tones of pink, magenta, lilac, and sky blue.",
    trackBg: "#240d21",
    trackBorder: "rgba(236, 72, 153, 0.4)",
    fillBackground: "linear-gradient(90deg, #ec4899, #d946ef, #a855f7, #38bdf8)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 8px rgba(236, 72, 153, 0.4)",
    textColor: "#fdf2f8",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "emoji",
      value: "🍬",
      name: "Candy",
      position: "progress-edge",
      glow: "0 0 12px rgba(236, 72, 153, 0.85), 0 0 6px rgba(217, 70, 239, 0.6)",
      backplate: true,
      backplateBg: "rgba(36, 13, 33, 0.9)",
      backplateBorder: "rgba(236, 72, 153, 0.6)",
      trail: "spark",
    },
    motion: {
      type: "bounce",
      duration: 900,
      intensity: "playful",
      animationClass: "animate-mascot-bounce",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "cosmic-nebula": {
    id: "cosmic-nebula",
    name: "Cosmic Nebula",
    description: "Galactic sci-fi blend of ultraviolet, indigo, magenta, and electric blue.",
    trackBg: "#080d1a",
    trackBorder: "rgba(139, 92, 246, 0.4)",
    fillBackground: "linear-gradient(90deg, #6366f1, #8b5cf6, #d946ef, #06b6d4)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 10px rgba(139, 92, 246, 0.45)",
    textColor: "#e0e7ff",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "emoji",
      value: "🚀",
      name: "Rocket",
      position: "progress-edge",
      glow: "0 0 14px rgba(139, 92, 246, 0.85), 0 0 6px rgba(6, 182, 212, 0.7)",
      backplate: true,
      backplateBg: "rgba(8, 13, 26, 0.9)",
      backplateBorder: "rgba(139, 92, 246, 0.6)",
      trail: "star",
    },
    motion: {
      type: "glide",
      duration: 1000,
      intensity: "playful",
      animationClass: "animate-mascot-rocket-glide",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
  "soviet": {
    id: "soviet",
    name: "Soviet Red",
    description: "Revolutionary crimson and gold aesthetic with hammer and sickle mascot and steady pulse motion.",
    trackBg: "#1a0505",
    trackBorder: "rgba(234, 179, 8, 0.45)",
    fillBackground: "linear-gradient(90deg, #991b1b, #dc2626, #eab308)",
    fillBackgroundSize: "200% 100%",
    glow: "0 0 10px rgba(220, 38, 38, 0.55), 0 0 4px rgba(234, 179, 8, 0.4)",
    textColor: "#fef08a",
    hasAnimation: true,
    animationClass: "animate-progress-rainbow",
    marker: null,
    mascot: {
      type: "glyph",
      value: "☭",
      name: "Hammer & Sickle",
      position: "progress-edge",
      glow: "0 0 14px rgba(220, 38, 38, 0.9), 0 0 6px rgba(234, 179, 8, 0.7)",
      backplate: true,
      backplateBg: "rgba(26, 5, 5, 0.9)",
      backplateBorder: "rgba(234, 179, 8, 0.7)",
      trail: "glow",
    },
    motion: {
      type: "pulse",
      duration: 900,
      intensity: "normal",
      animationClass: "animate-mascot-soviet-pulse",
      indeterminateClass: "animate-mascot-indeterminate-sweep",
    },
    decoration: "glow",
  },
}

export const PROGRESS_THEME_IDS = Object.keys(PROGRESS_THEMES) as ProgressThemeId[]

export function resolveProgressThemeId(rawId?: string | null): ProgressThemeId {
  if (!rawId || typeof rawId !== "string") return DEFAULT_PROGRESS_THEME_ID
  if (rawId in PROGRESS_THEMES) return rawId as ProgressThemeId
  // Legacy aliases fallback
  if (rawId === "matrix") return "matrix-rain"
  if (rawId === "cyberpunk") return "synthwave"
  if (rawId === "retro-crt") return "arcade-pixel"
  if (rawId === "rainbow") return "rainbow-pop"
  if (rawId === "lava") return "lava-lamp"
  if (rawId === "ocean") return "ocean-wave"
  if (rawId === "communist" || rawId === "ussr" || rawId === "soviet-red") return "soviet"
  return DEFAULT_PROGRESS_THEME_ID
}

export function getProgressTheme(id?: string | null): ProgressTheme {
  const resolved = resolveProgressThemeId(id)
  return PROGRESS_THEMES[resolved]
}
