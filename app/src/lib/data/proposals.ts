// Proposals, templates, revisions and the attached source PDFs.
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { Block, LineItem } from "@/lib/doc";
import { addYearsISO, localISO } from "@/lib/format";

export type ProposalStatus = "draft" | "sent" | "accepted" | "declined";
export type ProposalClient = Pick<Tables<"clients">,
  "id" | "name" | "is_individual" | "email" | "phone" | "street" | "city" | "province" | "postal_code"> & {
  contacts: Pick<Tables<"client_contacts">, "id" | "name" | "title" | "email" | "phone" | "is_primary">[];
};
export type Proposal = Omit<Tables<"proposals">, "sections" | "line_items"> & {
  sections: Block[];
  line_items: LineItem[];
  client: ProposalClient | null;
  converted_project: Pick<Tables<"projects">, "id" | "number" | "status"> | null;
};
export type Template = Omit<Tables<"proposal_templates">, "sections" | "default_line_items"> & {
  sections: Block[];
  default_line_items: LineItem[];
};
export type Revision = Tables<"proposal_revisions">;

const SELECT =
  "*, client:clients(id, name, is_individual, email, phone, street, city, province, postal_code, " +
  "contacts:client_contacts(id, name, title, email, phone, is_primary)), " +
  "converted_project:converted_project_id(id, number, status)";

function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}
const asProposal = (r: unknown) => r as Proposal;

export const proposalKeys = {
  all: ["proposals"] as const,
  list: (status: string) => ["proposals", "list", status] as const,
  one: (id: string) => ["proposals", "one", id] as const,
  revisions: (id: string) => ["proposals", "revisions", id] as const,
  templates: ["proposal_templates"] as const,
};

export const proposalsQuery = (status: string) => queryOptions({
  queryKey: proposalKeys.list(status),
  queryFn: async () => {
    let q = supabase.from("proposals").select(SELECT).order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    return (unwrap(await q) as unknown[]).map(asProposal);
  },
});

export const proposalQuery = (id: string) => queryOptions({
  queryKey: proposalKeys.one(id),
  queryFn: async () => asProposal(unwrap(await supabase.from("proposals").select(SELECT).eq("id", id).single())),
});

export const templatesQuery = queryOptions({
  queryKey: proposalKeys.templates,
  queryFn: async () => unwrap(await supabase.from("proposal_templates").select("*").order("name")) as unknown as Template[],
});

export const templateQuery = (id: string) => queryOptions({
  queryKey: [...proposalKeys.templates, id],
  queryFn: async () => unwrap(await supabase.from("proposal_templates").select("*").eq("id", id).single()) as unknown as Template,
});

export async function saveTemplate(id: string | null, t: { name: string; sections: Block[]; default_line_items: LineItem[] }) {
  const body = { name: t.name, sections: t.sections as unknown as Json, default_line_items: t.default_line_items as unknown as Json };
  const q = id
    ? supabase.from("proposal_templates").update(body).eq("id", id).select().single()
    : supabase.from("proposal_templates").insert(body).select().single();
  return unwrap(await q) as unknown as Template;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("proposal_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const revisionsQuery = (proposalId: string) => queryOptions({
  queryKey: proposalKeys.revisions(proposalId),
  queryFn: async () => unwrap(await supabase.from("proposal_revisions").select("*")
    .eq("proposal_id", proposalId).order("revised_on", { ascending: false }).order("created_at", { ascending: false })),
});

/* ---------------- changes ---------------- */

const today = () => localISO();
const plusYear = (iso: string) => addYearsISO(iso, 1);

export async function createProposal(patch: Omit<TablesInsert<"proposals">, "sections" | "line_items"> & { sections: Block[]; line_items: LineItem[] }) {
  return asProposal(unwrap(await supabase.from("proposals")
    .insert({ ...patch, sections: patch.sections as unknown as Json, line_items: patch.line_items as unknown as Json })
    .select(SELECT).single()));
}

type ProposalPatch = Omit<TablesUpdate<"proposals">, "sections" | "line_items"> & { sections?: Block[]; line_items?: LineItem[] };
export async function updateProposal(id: string, patch: ProposalPatch) {
  const body = { ...patch } as TablesUpdate<"proposals">;
  if (patch.sections) body.sections = patch.sections as unknown as Json;
  if (patch.line_items) body.line_items = patch.line_items as unknown as Json;
  return asProposal(unwrap(await supabase.from("proposals").update(body).eq("id", id).select(SELECT).single()));
}

export function useUpdateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProposalPatch }) => updateProposal(id, patch),
    onSuccess: (p) => {
      qc.setQueryData(proposalKeys.one(p.id), p);
      qc.invalidateQueries({ queryKey: ["proposals", "list"] });
    },
  });
}

export function statusPatch(status: ProposalStatus): ProposalPatch {
  const patch: ProposalPatch = { status };
  if (status === "sent") { patch.sent_date = today(); patch.valid_until = plusYear(today()); }
  if (status === "accepted" || status === "declined") patch.decided_date = today();
  return patch;
}

export async function deleteProposal(id: string) {
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* The project keeps the proposal's number (the insert trigger only draws one when none
   is given) and, for an imported proposal, its PDF. */
export async function convertProposal(p: Proposal, opts: {
  start_date: string | null; due_date: string | null; deliverables: { label: string; done: boolean }[];
}) {
  const project = unwrap(await supabase.from("projects").insert({
    number: p.number, client_id: p.client_id, title: p.title, scope: p.project_scope ?? "other",
    status: "lead", start_date: opts.start_date, due_date: opts.due_date,
    deliverables: opts.deliverables as unknown as Json,
    source_pdf_path: p.source_pdf_path ?? null,
  }).select("id, number").single());
  await updateProposal(p.id, { converted_project_id: project.id });
  return project;
}

/* ---------------- revisions ---------------- */

export function useRevisionMutations(proposalId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: proposalKeys.revisions(proposalId) });
  return {
    add: useMutation({
      mutationFn: async () => unwrap(await supabase.from("proposal_revisions")
        .insert({ proposal_id: proposalId, revised_on: today() }).select().single()),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<"proposal_revisions"> }) =>
        unwrap(await supabase.from("proposal_revisions").update(patch).eq("id", id).select().single()),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from("proposal_revisions").delete().eq("id", id);
        if (error) throw new Error(error.message);
      },
      onSuccess: refresh,
    }),
  };
}

/* ---------------- the source PDF (private bucket) ---------------- */

const BUCKET = "proposal-sources";

export async function uploadProposalSource(file: File) {
  const safe = (file.name || "proposal.pdf").replace(/[^\w.-]+/g, "-").slice(-60);
  const path = `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: "application/pdf" });
  if (error) {
    if (/row-level security|Unauthorized|AccessDenied/i.test(error.message)) {
      throw new Error("Storage refused the upload. Sign out and back in, then try again.");
    }
    throw new Error(error.message);
  }
  return path;
}

// The name it was uploaded under: uploads are prefixed "src-<when>-<random>-".
export const sourceName = (path: string | null | undefined) =>
  path ? (path.split("/").pop() ?? "").replace(/^src-\d+-[a-z0-9]+-/i, "") : "";

export async function sourceUrl(pathOrUrl: string) {
  let path = pathOrUrl;
  const m = path.match(/\/object\/(?:public|sign|authenticated)\/proposal-sources\/([^?]+)/);
  if (m) path = decodeURIComponent(m[1]);
  else if (/^https?:\/\//.test(path)) return pathOrUrl;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/* ---------------- client details used on the letter ---------------- */

export async function saveRecipient(client: ProposalClient, r: {
  contact_name: string; contact_title: string; street: string; city: string; province: string; email: string; phone: string;
}) {
  const nul = (s: string) => (s.trim() ? s.trim() : null);
  unwrap(await supabase.from("clients").update({
    street: nul(r.street), city: nul(r.city), province: nul(r.province), email: nul(r.email), phone: nul(r.phone),
  }).eq("id", client.id).select("id"));
  if (!r.contact_name.trim()) return;
  const primary = client.contacts.find((c) => c.is_primary) ?? client.contacts[0];
  const row = { client_id: client.id, name: r.contact_name.trim(), title: nul(r.contact_title),
                email: nul(r.email), phone: nul(r.phone), is_primary: true };
  if (primary) unwrap(await supabase.from("client_contacts").update(row).eq("id", primary.id).select("id"));
  else unwrap(await supabase.from("client_contacts").insert(row).select("id"));
}
