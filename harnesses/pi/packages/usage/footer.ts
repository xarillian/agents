import type { UsageResult } from "./usage.ts";

export const USAGE_UPDATE = "usage:update";
export const USAGE_REQUEST = "usage:request";
export type UsageUpdate = UsageResult | undefined;
