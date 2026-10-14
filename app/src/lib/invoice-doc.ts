// The printed invoice and its arithmetic, shared with the previous portal (js/). Typed here.
import "@site/css/document.css";
import "@site/css/print.css";
import * as tpl from "@site/js/core/invoice-template.js";
import * as calc from "@site/js/core/invoice-calc.js";
import * as doc from "@site/js/print/invoice-doc.js";
import * as print from "@site/js/print/invoice-print.js";
import type { Block } from "@/lib/doc";

/* A progress line: the agreed budget, and what this invoice draws against it. What
   earlier invoices drew ("previous") is worked out from the project's other invoices. */
export type ProgressLine = {
  id: string;
  description: string;
  budget: number;
  amount: number;
  source_time_entry_ids?: string[];
  source_expense_ids?: string[];
};
export type TaxDef = { label: string; rate: number; enabled: boolean };
export type Totals = { subtotal: number; taxLines: { label: string; rate: number; amount: number }[]; taxTotal: number; total: number };

export const INVOICE_PARTS: { id: "details" | "lines" | "payment"; label: string }[] = tpl.PARTS;
export const INVOICE_LEVELS: { value: number; label: string }[] = tpl.LEVELS;
export const defaultInvoiceSections: () => Block[] = tpl.defaultInvoiceSections;
export const normaliseInvoiceSections: (s: unknown) => Block[] = tpl.normaliseInvoiceSections;
export const lineKey: (li: Partial<ProgressLine>) => string = tpl.lineKey;
export const newLineId: () => string = tpl.newLineId;
export const budgetLinesFromProposal: (items: unknown[]) => ProgressLine[] = tpl.budgetLinesFromProposal;

export const lineBalance: (li: ProgressLine, previous?: number) => number = calc.lineBalance;
export const lineRemaining: (li: ProgressLine, previous?: number) => number = calc.lineRemaining;
export const computeProgressTotals: (lines: ProgressLine[], taxes: TaxDef[], apply: boolean) => Totals = calc.computeProgressTotals;

export const INVOICE_TOKEN_HELP: string[] = doc.INVOICE_TOKEN_HELP;
export const invoiceDocHtml: (inv: unknown, settings: unknown, ctx: { previous: number[] }) => string = doc.invoiceDocHtml;
/** Opens the print dialog; the PDF is named Invoice_YYNNN-XXX. */
export const printInvoice: (inv: unknown, settings: unknown, ctx: { previous: number[] }) => void = print.printInvoice;
