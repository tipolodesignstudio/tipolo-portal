// The standard Tipolo proposal, as blocks.
//
// Transcribed from 05_Proposals/26102 Connect LA Website — the project's own wording is
// replaced with [bracketed placeholders], everything that is house boilerplate (the
// agreement especially) is kept verbatim so a new proposal starts complete and is edited
// down rather than written up.
//
// A block is { part, level, heading, body } or a table block { part, kind, rows }:
//
//   part    cover | workplan | schedule | fees | agreement   — the builder's five tabs
//   level   1 = "Work Plan"        13.9pt
//           2 = "Task 1: …"        10.6pt
//           3 = "Deliverables"      9.1pt bold
//           0 = body copy, no heading
//   kind    schedule | fees | optional-fees | payment | signature — table or chart
//           the schedule block also carries scale: "week" | "day" for the gantt
//   breakBefore  start this block on a fresh page
//
// In body text a line starting "• " is a bullet and each two leading spaces before it
// is one more level of indent, matching the source document's 18pt steps.

export const PARTS = [
  { id: "cover", label: "Cover Letter" },
  { id: "workplan", label: "Work Plan" },
  { id: "schedule", label: "Project Schedule" },
  { id: "fees", label: "Design Fees" },
  { id: "agreement", label: "Design Services Agreement" },
];

export const LEVELS = [
  { value: 1, label: "Heading 1" },
  { value: 2, label: "Heading 2" },
  { value: 3, label: "Heading 3" },
  { value: 0, label: "Body text" },
];

/* ------------------------------------------------------------------ cover letter */

const COVER = [
  { part: "cover", level: 0, body:
`Dear [First Name],

Tipolo Design Studio is pleased to submit a [landscape/multimedia] design services proposal for [Client Name]'s [project in a few words]. [One sentence on the particular constraint or opportunity you discussed — what will make or break the job.]

As the principal designer, I bring more than 10 years of training and experience in multimedia design, using modern tools and techniques. I add real value to a company's brand through effective graphic design and visual communications. Through Tipolo Design Studio's collaboration with [Client Name], we aim to deliver a comprehensive set of materials with a strategic approach to high-quality output, a reasonable schedule, and competitive pricing.

Based on our initial discussion, we are setting [number] milestones to achieve within this scope of work:

1. [Milestone one.]
2. [Milestone two.]
3. [Milestone three.]
4. [Milestone four.]

This proposal covers the proposed work plan, expected deliverables and exclusions, schedule, and service fee breakdown. Lastly, we have provided recommendations for optional services for you to review and consider.

If you have any questions, feel free to reach out. Thank you.` },
];

/* -------------------------------------------------------------------- work plan */

const TASK_BLOCKS = (n, name) => [
  { part: "workplan", level: 2, heading: `Task ${n}: [${name}]`, body:
    `[What this task covers, in two or three sentences: what you will do, what the Client provides, and what state the work is in when the task ends.]` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
    `• [Deliverable]` },
  { part: "workplan", level: 3, heading: "Meetings", body:
    `• [Meeting or review]` },
  { part: "workplan", level: 3, heading: "Exclusions", body:
    `• [Anything a reader might reasonably assume is included but is not.]` },
];

const WORKPLAN = [
  { part: "workplan", level: 1, heading: "Work Plan" },
  ...TASK_BLOCKS(1, "Task Name"),
  ...TASK_BLOCKS(2, "Task Name"),
  ...TASK_BLOCKS(3, "Task Name"),
  ...TASK_BLOCKS(4, "Task Name"),

  { part: "workplan", level: 1, heading: "Optional Services" },
  { part: "workplan", level: 2, heading: "Task A: [Task Name]", body:
    `[What the optional task covers and when it must be decided — before a subscription lapses, after launch, and so on.]` },
  { part: "workplan", level: 3, heading: "Deliverables", body: `• [Deliverable]` },
  { part: "workplan", level: 2, heading: "Task B: [Task Name]", body:
    `[What the optional task covers and when it must be decided.]` },
  { part: "workplan", level: 3, heading: "Deliverables", body: `• [Deliverable]` },
];

/* --------------------------------------------------------------- project schedule */

const SCHEDULE = [
  { part: "schedule", level: 1, heading: "Project Schedule" },
  // Seeded with a six-week shape off the next Monday so the chart is real from the
  // start — placeholder dates, like the placeholder text. "Project Start" has no due
  // date on purpose: a row without one plots as a milestone diamond.
  { part: "schedule", kind: "schedule", scale: "week", rows: scheduleSeed() },
];

// Monday of next week, then week offsets from it.
function scheduleSeed() {
  const mon = new Date();
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7));   // the coming Monday
  const at = (weeks, days = 0) => {
    const d = new Date(mon);
    d.setDate(d.getDate() + weeks * 7 + days);
    return d.toISOString().slice(0, 10);
  };
  return [
    { task: "Project Start", start: at(0), due: "" },
    { task: "Task 1: [Task Name]", start: at(0), due: at(0, 4) },
    { task: "Task 2: [Task Name]", start: at(1), due: at(2, 4) },
    { task: "Task 3: [Task Name]", start: at(3), due: at(5, 4) },
    { task: "Task 4: [Task Name]", start: at(4), due: at(5, 4) },
  ];
}

/* ------------------------------------------------------------------- design fees */

const FEES = [
  { part: "fees", level: 1, heading: "Design Fees", body:
`Base scope fees are determined by the level of effort and estimated hours, calculated using our hourly rate. This is a not-to-exceed estimate, not a padded quote. Only hours incurred will be invoiced to the Client. Optional Scope to be confirmed by Client in writing and will be invoiced after each approved task is completed.` },

  { part: "fees", level: 3, heading: "A. Base Scope" },
  { part: "fees", kind: "fees" },

  { part: "fees", level: 3, heading: "B. Optional Scope" },
  { part: "fees", kind: "optional-fees", rows: [
    { code: "A", description: "[Optional task] (approx. [n] hrs)", fee: "$ [0.00]" },
    { code: "B", description: "[Optional task] (approx. [n] hr per [n] entries)", fee: "$ [0.00]/hr" },
  ] },

  { part: "fees", level: 2, heading: "Fee Exclusions", body:
`• Any work beyond the scope and schedule described in the Work Plan will be subject to additional fees, billed hourly at the rates outlined below.
• Disbursements for Licensed Materials. Refer to Design Services Agreement
• Subscription costs such as domain, web hosting, and all other necessary tools to implement the base scope are not included in the proposed base fees. The Client must pay costs associated with their own subscriptions.` },

  { part: "fees", level: 2, heading: "Hourly Rate ([Year])", body:
`• Principal Designer: $[00.00]/hour ($[000] per day)` },

  { part: "fees", level: 2, heading: "Payment Schedule" },
  // Percentages are edited; the amounts are worked out from the A. Base Scope total.
  { part: "fees", kind: "payment", rows: [
    { pct: 20, label: "down payment to initiate work" },
    { pct: 30, label: "due upon approval of Task 2 [Task Name]/Final Presentation" },
    { pct: 50, label: "due before [final deliverable]" },
    { pct: "", label: "Optional Scopes are due upon completion of the specific task." },
  ] },

  { part: "fees", level: 2, heading: "Payment Procedures", body:
`• Cheques shall be made payable to "Jim Dema-ala" and be delivered to the address specified on the invoice or handed in person; or
• Electronic Funds Transfers (EFT) to be sent via email to accounting@tipolo.ca only. Submit a copy of payment transmission records or email confirmation from the bank for verification.` },
];

/* -------------------------------------------------------- design services agreement
   House boilerplate — kept word for word. Every clause is still editable per proposal. */

const AGREEMENT = [
  { part: "agreement", level: 1, breakBefore: true, heading: "Design Services Agreement", body:
`This agreement (the "Design Services Agreement") is made on "Date" by and between [Client Legal Name] as the "Client", and Tipolo Design Studio as the "Designer". In consideration of the mutual agreement made herein, both parties agree as follows:` },

  { part: "agreement", level: 3, heading: "Work", body:
`The Designer agrees to produce project materials (the "Work") at the Client's request, for fees agreed upon in advance, and to deliver the Work by an agreed-upon deadline. The Designer agrees that he will be the sole author of the Work, which will be original and free of plagiarism. The Designer will cooperate with the Client in editing and otherwise reviewing the Work before completion and launch.` },

  { part: "agreement", level: 3, heading: "Confidentiality", body:
`The Designer acknowledges that he may receive or have access to information relating to the Client's past, present, or future products, vendor lists, creative works, marketing strategies, pending projects/proposals, and other proprietary information. The Designer agrees to protect the confidentiality of the Client's proprietary information and all physical forms thereof, whether disclosed to the Designer before this Agreement is signed or afterward. Unless strict confidentiality is requested by the Client in advance of the establishment of this contract, the Designer may display materials and final work created for the Client on the Designer's website, social media pages, and online portfolio portals.` },

  { part: "agreement", level: 3, heading: "Compensation", body:
`The Designer will charge the Client fees as provided in the "Design Fees and Schedule" for the Work (the "Compensation"). The Client agrees to pay the Designer as outlined in the Payment Schedule and Payment Procedures. All Invoices submitted by the Designer to the Client are due within 30 days of receipt (NET 30). If payment is not received within the payment terms stated on the invoice, the Designer reserves the right to charge interest on the unpaid balance at 2% per month (24% per annum), calculated and compounded monthly, from the due date until paid in full. The Designer will issue a final invoice/statement of account after delivering any workable files. If the parameters of the Work change, or if it takes longer than estimated, the Designer will inform the Client to renegotiate the Work's cost. The Designer is responsible for paying all federal, provincial, and/or local taxes on the services he performs for the Client as an independent contractor. The Client will not treat the Designer as an employee for any purpose.` },

  { part: "agreement", level: 3, heading: "Client Approval", body:
`Upon acceptance of the Work, the Client accepts responsibility for any further processes in which the Work is used (e.g. film outpost, printing, etc.) The Designer is not responsible for errors occurring in the Work or in projects related to the Work after the Client has accepted it.` },

  { part: "agreement", level: 3, heading: "Cancellation", body:
`Both parties understand that the Client or the Designer may terminate the engagement at any time, for any reason, if either party deems the relationship unsatisfactory. Upon written or verbal cancellation, the Client is responsible for payment of all expenses incurred, plus any work completed toward the project, based on the percentage of completion as determined by the Designer. If the Client cancels the project after completion, the Client is responsible for full payment per the agreed-upon estimate, plus all expenses incurred. In the event of cancellation, the Designer retains ownership of all copyrights and original work created.` },

  { part: "agreement", level: 3, heading: "Intellectual Property", body:
`During the duration of the project, all materials created by the Designer are copyrighted in the name of the Designer, as well as materials provided by the Client are copyrighted in the name of the Client. The Designer has the right to use the Client's copyrighted materials to fulfill the project requirements and goals.

If the project is terminated before completion, the Designer reserves the right to retain the materials created for portfolio and demonstration purposes, provided the Designer credits the Client for the materials used in the portfolio entry.

Upon the completion of the project and full payment of the final invoice's balance, the Designer turns over the copyright of the deliverables (excluding original project files) to the name of the Client. The Designer, however, may still use project images for portfolio purposes.` },

  { part: "agreement", level: 3, heading: "Privacy and Third-Party Responsibility", body:
`During the project, the Client grants the Designer access to the Client's accounts to perform the duties and responsibilities outlined in the Work Plan. The Designer will take measures to protect the Client's sensitive information as noted under Confidentiality. However, the Designer cannot guarantee these security measures and acknowledges the risk of sensitive information being leaked due to the negligence of the Client or a third party. The Client acknowledges and agrees that the Designer is not responsible for any loss or damage due to negligence of the Client or the third party, including any unauthorized use of Client's account by a third party.` },

  { part: "agreement", level: 3, heading: "Stock Media and Font Licensing", body:
`In compliance with copyright laws, any purchased commercial fonts and stock images will be licensed in the name of the Client. The Designer may purchase stock images, videos, and premium fonts on behalf of the Client as a reimbursable disbursement cost, and these costs will be included in the invoice. However, the Client may opt to purchase and license the fonts and stock images themselves at their discretion.

The Designer has the right to use the licensed materials solely for the Client's projects and may not use them in other commercial or non-personal projects. The Designer's right to use the fonts applies only for the duration of the project, until the project is fully turned over upon termination of the project agreement. Lastly, the Designer assumes no responsibility for the Client's misuse of the license.` },

  { part: "agreement", level: 3, heading: "Revisions", body:
`Based on a professional and fair evaluation, the Designer determines whether requested feedback qualifies as a revision.

A client-directed revision is a change in design direction or a deviation from the proposed Work Plan after the Client has approved it. This accounts for necessary rework on all deliverables and may be subject to additional scope review.

A project scope revision is an anticipated scope agreed upon by both parties as outlined in the Work Plan. The Designer accounts for any necessary rework and must not charge the Client additional costs.

A technical revision refers to visual and technical deficiencies in the work rendered by the Designer and does not include typographical or media errors provided by the Client. The Designer will make such corrections at no cost to the Client. Technical revisions do not apply after the Designer turns over the deliverables to the Client.` },

  { part: "agreement", level: 3, heading: "Acceptance of Terms", body:
`The Client agrees to pay for the services rendered by the Designer for the Work as agreed upon. By signing below, the Client acknowledges they have read and understood these terms and are legally bound by them.` },

  { part: "agreement", kind: "signature" },
];

/* ---------------------------------------------------------------------- assembly */

// A fresh proposal: every part complete, specifics still in brackets.
export function defaultSections() {
  return [...COVER, ...WORKPLAN, ...SCHEDULE, ...FEES, ...AGREEMENT]
    .map((b) => ({ ...b, ...(b.rows ? { rows: b.rows.map((r) => ({ ...r })) } : {}) }));
}

// The base-scope fee table a new proposal starts with.
// Hours in the Qty column and the task's rate in Unit price, so Fee is hours × rate and
// the printed TOTAL can say "(approx. N hrs)". Both start at zero — an untouched table
// prints a plain TOTAL rather than inventing an hour count.
export function defaultLineItems() {
  return [1, 2, 3, 4].map((n) => ({
    description: `[Task ${n} name]`, qty: 0, unit_price: 0,
  }));
}

// Older proposals stored a flat [{heading, body}] with no part or level. Treat those as
// Work Plan headings so they still open, and print, in the new builder.
export function normaliseSections(sections = []) {
  return sections.map((s) => {
    if (s.part || s.kind) return s;
    return { part: "workplan", level: s.heading ? 2 : 0, heading: s.heading || "", body: s.body || "" };
  });
}

export const partOf = (b) => b.part || "workplan";
