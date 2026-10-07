export type ScraperCategoryGroup = "nintendo" | "playstation" | "xbox" | "sega" | "other"

export interface ScraperCategory {
  id: string
  name: string
  group: ScraperCategoryGroup
  baseUrl: string
  titleSearch: string[]
  enabled: boolean
  builtIn: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ScraperCategoryOverride {
  name?: string
  group?: ScraperCategoryGroup
  baseUrl?: string
  titleSearch?: string[]
  enabled?: boolean
  updatedAt?: string
}

export interface ScraperCategoriesConfig {
  version: number
  overrides: Record<string, ScraperCategoryOverride>
  custom: ScraperCategory[]
}

export interface TestCategoryResult {
  success: boolean
  status: "OK" | "NO_TOPICS" | "SESSION_REQUIRED" | "INTERACTION_REQUIRED" | "ERROR"
  totalTopics: number
  matchedTopics: number
  sampleMatches: string[]
  error?: string
}

export interface CreateCategoryDTO {
  id: string
  name: string
  group: ScraperCategoryGroup
  baseUrl: string
  titleSearch: string[]
  enabled?: boolean
}

export interface UpdateCategoryDTO {
  name?: string
  group?: ScraperCategoryGroup
  baseUrl?: string
  titleSearch?: string[]
  enabled?: boolean
}
