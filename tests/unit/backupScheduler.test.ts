import { describe, expect, it } from "vitest"

const {
  validateCronExpression,
  calculateNextCronRun,
  calculateNextRun,
  getTimezone,
} = require("../../electron/database/backupScheduler.cjs")

describe("backupScheduler calculation & validation", () => {
  it("validates valid cron expressions", () => {
    expect(validateCronExpression("0 3 * * *")).toBe(true)
    expect(validateCronExpression("*/15 * * * *")).toBe(true)
    expect(validateCronExpression("0 0 1 1 *")).toBe(true)
    expect(validateCronExpression("30 4 * * 1-5")).toBe(true)
  })

  it("rejects invalid cron expressions", () => {
    expect(() => validateCronExpression("invalid")).toThrow()
    expect(() => validateCronExpression("0 3 * *")).toThrow() // only 4 parts
    expect(() => validateCronExpression("60 3 * * *")).toThrow() // minute out of bounds
    expect(() => validateCronExpression("0 25 * * *")).toThrow() // hour out of bounds
    expect(() => validateCronExpression("0 3 32 * *")).toThrow() // day of month out of bounds
    expect(() => validateCronExpression("0 3 * 13 *")).toThrow() // month out of bounds
    expect(() => validateCronExpression("0 3 * * 8")).toThrow() // day of week out of bounds
  })

  it("calculates next cron run for daily at 03:00", () => {
    const from = new Date("2026-10-06T02:00:00.000Z")
    const next = calculateNextCronRun("0 3 * * *", from)
    expect(next.getMinutes()).toBe(0)
    expect(next.getHours()).toBe(3)
  })

  it("calculates presets accurately", () => {
    const from = new Date("2026-10-06T10:00:00.000Z")
    
    // 6h preset
    const next6h = calculateNextRun({ scheduleType: "6h" }, from)
    expect(next6h > from).toBe(true)
    expect(next6h.getHours() % 6).toBe(0)

    // daily preset
    const nextDaily = calculateNextRun({ scheduleType: "daily" }, from)
    expect(nextDaily > from).toBe(true)
    expect(nextDaily.getHours()).toBe(3)

    // weekly preset
    const nextWeekly = calculateNextRun({ scheduleType: "weekly" }, from)
    expect(nextWeekly > from).toBe(true)
    expect(nextWeekly.getDay()).toBe(0) // Sunday
  })

  it("detects local system timezone", () => {
    const tz = getTimezone()
    expect(typeof tz).toBe("string")
    expect(tz.length).toBeGreaterThan(0)
  })
})

