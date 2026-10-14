import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/* Screens not yet rebuilt open in the current portal. In development that runs
   separately (python serve.py on 4176); in production it's the same site's root. */
const LEGACY_ROOT = import.meta.env.DEV ? "http://localhost:4176/" : "/";
export const legacy = (path: string) => `${LEGACY_ROOT}#${path}`;

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export const money = (n: number | string | null | undefined) => cad.format(Number(n) || 0);
