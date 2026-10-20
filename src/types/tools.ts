export type ToolCategory = "converter" | "firmware" | "resources" | "utilities";

export type ToolSourceType = "github" | "releases" | "resource";

export type ToolIconName = "ArrowLeftRight" | "Cpu" | "KeyRound";

export interface ToolDefinition {
  id: string;
  name: string;
  category: ToolCategory;
  url: string;
  sourceType: ToolSourceType;
  icon: ToolIconName;
  descriptionKey: string;
}

export interface ToolOpenResult {
  success: boolean;
  error?: string;
}

