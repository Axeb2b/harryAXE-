// Ambient shims so tsc typechecks without pnpm resolving these hoisted deps.
declare module "helmet" {
  import type { RequestHandler } from "express";
  const helmet: (options?: Record<string, unknown>) => RequestHandler;
  export default helmet;
}
declare module "express-rate-limit" {
  import type { RequestHandler } from "express";
  interface Options {
    windowMs?: number;
    max?: number;
    message?: unknown;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
    [k: string]: unknown;
  }
  const rateLimit: (options?: Options) => RequestHandler;
  export default rateLimit;
}
declare module "bcryptjs" {
  export function compare(s: string, hash: string): Promise<boolean>;
  export function hash(
    s: string,
    saltOrRounds: number | string
  ): Promise<string>;
}
