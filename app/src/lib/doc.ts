// The printed proposal, shared with the previous portal.
//
// The letterhead, the type, the pagination into real 8.5x11 sheets, the gantt and the
// house template all live in plain JS under js/ (see vite.config.ts → "@site"). Using
// them as they are, rather than rewriting them, means a proposal prints identically
// from either version. This file gives them types.

import "@site/css/document.css";
import "@site/css/print.css";
import * as docMod from "@site/js/print/proposal-doc.js";
import * as printMod from "@site/js/print/proposal-print.js";
import * as tplMod from "@site/js/core/proposal-template.js";
import * as tokMod from "@site/js/core/tokens.js";
import * as calcMod from "@site/js/core/invoice-calc.js";

export type Part = "cover" | "workplan" | "schedule" | "fees" | "agreement";
export type BlockKind = "payment" | "schedule" | "fees" | "optional-fees" | "signature" | "progress";

export type PaymentRow = { pct: number | ""; label: string };
export type ScheduleRow = { task: string; start: string; due: string };
export type OptionalRow = { code: string; description: string; fee: string };

export type Block = {
  part?: Part | "details" | "lines" | "payment";   // the last three are an invoice's
  level?: number;
  heading?: string;
  body?: string;
  kind?: BlockKind;
  rows?: (PaymentRow | ScheduleRow | OptionalRow)[];
  scale?: "week" | "day";
  breakBefore?: boolean;
};

export type LineItem = { description: string; qty: number; unit_price: number; [k: string]: unknown };

export const PARTS: { id: Part; label: string }[] = tplMod.PARTS;
export const LEVELS: { value: number; label: string }[] = tplMod.LEVELS;
export const normaliseSections: (s: unknown[]) => Block[] = tplMod.normaliseSections;
export const defaultSections: () => Block[] = tplMod.defaultSections;
export const defaultLineItems: () => LineItem[] = tplMod.defaultLineItems;

export const buildTokenMap: (o: { client?: unknown; proposal?: unknown; settings?: unknown }) => Record<string, string> =
  tokMod.buildTokenMap;
export const resolveSections: (s: Block[], map: Record<string, string>) => Block[] = tokMod.resolveSections;
export const TOKEN_HELP: string[] = tokMod.TOKEN_HELP;

export const lineAmount: (li: Partial<LineItem>) => number = calcMod.lineAmount;

/** The finished pages, as HTML — the same markup the printer gets. */
export const proposalDocHtml: (p: unknown, settings: unknown) => string = docMod.proposalDocHtml;
/** Opens the browser's print dialog ("Save as PDF") on the finished pages. */
export const printProposal: (p: unknown, settings: unknown) => void = printMod.printProposal;

export const KIND_LABEL: Record<BlockKind, string> = {
  payment: "Payment schedule",
  schedule: "Schedule table",
  fees: "Base scope fee table",
  "optional-fees": "Optional scope fee table",
  signature: "Signature block",
  progress: "Invoice table",
};
