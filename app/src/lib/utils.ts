import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/* Screens not yet rebuilt open in the previous portal, published at /legacy/. In
   development it runs separately (python serve.py on 4176). */
const LEGACY_ROOT = import.meta.env.DEV ? "http://localhost:4176/" : "/legacy/";
export const legacy = (path: string) => `${LEGACY_ROOT}#${path}`;
