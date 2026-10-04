import type { UsageResult } from "./usage.ts";

export const USAGE_UPDATE = "w-usage:update";
export const USAGE_REQUEST = "w-usage:request";
export type UsageUpdate = UsageResult | undefined;
