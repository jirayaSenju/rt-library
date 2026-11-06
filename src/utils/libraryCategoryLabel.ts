import { LibraryItem } from "@/types"

export function getLibraryCategoryLabel(item: Pick<LibraryItem, "categoryId" | "topicTitle" | "title">): string {
  if (item.categoryId === "switch2" || item.categoryId === "switch-2") {
    return "Switch 2"
  }
  if (item.categoryId === "switch" && /порт|хоумбрю/i.test(`${item.topicTitle || ""} ${item.title || ""}`)) {
    return "Switch Ports"
  }
  return item.categoryId
}
