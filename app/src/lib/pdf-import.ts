// Reading a finished proposal PDF, and the studio's Google Drive filing — both shared
// with the previous portal (js/core). Typed here.
import * as pdfMod from "@site/js/core/pdf-text.js";
import * as parseMod from "@site/js/core/proposal-parse.js";
import * as scanMod from "@site/js/core/drive-scan.js";
import * as driveMod from "@site/js/core/gdrive.js";
import type { Block, LineItem } from "@/lib/doc";

export type PdfDoc = { text: string; pageCount: number; pages: unknown[]; bodySize: number };
export type ParsedProposal = {
  title: string;
  client_name: string;
  client_id: string;
  project_scope: string;
  sections: Block[];
  line_items: LineItem[];
  subtotal: number;
  warnings: string[];
  conf: Partial<Record<"title" | "client_name" | "project_scope" | "line_items", number>>;
};
type ClientLike = { id: string; name: string };

export const extractPdf: (f: File | ArrayBuffer) => Promise<PdfDoc> = pdfMod.extractPdf;
export const parseProposal: (doc: PdfDoc, o: { clients: ClientLike[]; businessName?: string }) => ParsedProposal =
  parseMod.parseProposal;
export const matchClient: (name: string, clients: ClientLike[]) => { client: ClientLike | null; near: ClientLike | null; score: number } =
  parseMod.matchClient;

/* ---- Drive ---- */
export type DriveFile = { id: string; name: string; mimeType: string; parents?: string[]; webViewLink?: string };
export type ProposalFolder = { number: string; title: string; scope: string | null; folder: DriveFile; pdf: DriveFile | null; pdfs: DriveFile[] };
export type ProjectFolder = { number: string; title: string; scope: string | null; folder: DriveFile; invoices: { file: DriveFile; number: string | null }[] };

export const scanProposals: (folderId: string, o?: { from?: string }) => Promise<ProposalFolder[]> = scanMod.scanProposals;
export const scanProjects: (folderId: string, o?: { from?: string }) => Promise<ProjectFolder[]> = scanMod.scanProjects;
export const fileFromDrive: (meta: DriveFile) => Promise<File> = scanMod.fileFromDrive;

export const drive = {
  configured: driveMod.configured as () => boolean,
  connected: driveMod.connected as () => boolean,
  /** opens Google's popup — call it first thing in a click handler, before any await */
  connect: driveMod.connect as (o?: { email?: string }) => Promise<string>,
  loadGoogle: driveMod.loadGoogle as () => Promise<boolean>,
  onConnectionChange: driveMod.onConnectionChange as (fn: (on: boolean) => void) => () => void,
};
