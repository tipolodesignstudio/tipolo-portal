// The "Web Design" proposal template.
//
// The house template (proposal-template.js) leaves the work plan generic. This fills it
// in for a website job, transcribed from 05_Proposals/26102 Connect LA Website and
// generalised: the wording that is the same every time is written out, and only what
// changes per project is left in [brackets], which print red until they are replaced.
//
// The fees, agreement and letterhead furniture come from the house template unchanged —
// this only substitutes the cover letter, work plan and schedule task names.

import {
  defaultSections, scheduleSeedFor, AGREEMENT_BLOCKS, FEES_BLOCKS,
} from "./proposal-template.js";

const COVER = [
  { part: "cover", level: 0, body:
`Dear {{client.firstName}},

Tipolo Design Studio is pleased to submit a multimedia design services proposal for [Client Name]'s website redesign. Beyond the redesign, we understand that a well-executed migration from [current platform] to [new platform] will be essential to minimise your website's downtime.

As the principal designer, I bring more than 10 years of training and experience in multimedia design, using modern tools and techniques. I add real value to a company's brand through effective graphic design and visual communications. Through Tipolo Design Studio's collaboration with [Client Name], we aim to deliver a comprehensive set of materials with a strategic approach to high-quality output, a reasonable schedule, and competitive pricing.

Based on our initial discussion, we are setting four milestones to achieve within this scope of work:

1. Develop two design mock-up options using [platform] templates.
2. Set up a functional website based on the approved design with [n] projects and [n] blog posts.
3. Archive selected projects and blog posts to sunset the [old platform] subscription.
4. Port [platform] to the existing domain and launch the new website.

This proposal covers the proposed work plan, expected deliverables and exclusions, schedule, and service fee breakdown. Lastly, we have provided recommendations for optional services for you to review and consider.

If you have any questions, feel free to reach out. Thank you.` },
];

const WORKPLAN = [
  { part: "workplan", level: 1, heading: "Work Plan" },

  { part: "workplan", level: 2, heading: "Task 1: Template Exploration & Mock-ups", body:
`We will prepare two [platform] template options and create static mock-ups using [Client Name]'s brand materials. Each option will preview five core pages (Homepage, About Us, Project Gallery, Blog, Contact), along with a sample Project Page and Team Member's Bio for initial review and feedback. After presentation and review, the selected design option will move to full design implementation.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• 1 Round of Design Mock-up Presentation with 2 Options` },
  { part: "workplan", level: 3, heading: "Meetings", body:
`• 1 Round of Design Review Meeting` },
  { part: "workplan", level: 3, heading: "Exclusions", body:
`• Premium Templates from third-party providers. Unless directed by the Client, template options are limited to
  [platform] themes included at no additional cost with the selected subscription package.
• Revisions of the presentation; feedback will be incorporated as part of the next deliverable.` },

  { part: "workplan", level: 2, heading: "Task 2: Website Design & Content Migration", body:
`This scope will run concurrently with two major tasks: Website Design and Content Migration. The Client will provide all necessary materials, such as new project information (text and media), before production begins.

  A. Website Design
    Upon the Client's confirmation, set up the Client's [platform] account and develop a five-page website in [platform], customised to suit the current company branding. As an industry standard, the website must be:
    • Responsive — The entire site will be compatible with all devices and screen sizes (desktop, tablet, or mobile);
    • Intuitive — The User Interface and User Experience (UI/UX) will be the top priority of this design exercise; and
    • Optimised — Convert all media materials (photo and video) to web-friendly file formats and sizes to minimise
      loading wait times.

  B. Content Migration
    Based on the information provided by the Client, transfer all media from [old platform] to [new platform]:
    • Transfer existing projects or add new projects, up to a maximum of [n] projects;
    • Transfer all current staff information and images; and
    • Transfer [n] existing blog posts, as determined by the Client.

    The Designer will provide a structured cloud-based shared folder for the Client's use. Through the shared folder, the Client will provide all new media and text content required for the work.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• Website Framework
    • Main Website Navigation: Home / About Us / Projects / News / Contact Us
    • External Website Navigation: [Facebook / Instagram / LinkedIn]
• Core Web Pages to include:
    (1) Homepage
      • Splash page/Landing Screen (no scrolling)
      • Media Slider/Carousel (featured projects)
      • Convenience link buttons to "About Us" and "Projects"
    (2) About Us
      • Company Profile
      • Team Gallery (with additional information provided for the [n] Principals)
    (3) Projects
      • Projects Image Gallery, maximum [n] projects (with flexibility to add/remove)
      • Category filter mechanism, up to [n] categories
    (4) News
      • [n] Blog Posts (with flexibility to add/remove)
    (5) Contact Us Page
      • Careers Section
      • Google Maps block, pinned to office address
      • Contact Form (sent to [email address])
• Secondary Web Pages to include:
    (1) Team Member's Page / Bio Template
    (2) Project Page Template
• Allowance for 1 round of revisions based on 50% progress review/feedback` },
  { part: "workplan", level: 3, heading: "Meetings", body:
`• 1 Progress Review at 50% Progress
    • Home Page (complete)
    • About Us ([n] principal / [n] staff)
    • Projects ([n] projects of each category)
    • News ([n] blog post)
    • Contact Us (complete)
    • Team's Page/Bio Template (complete)
    • Project Page Template (complete)
• 1 Final Presentation` },
  { part: "workplan", level: 3, heading: "Exclusions", body:
`• Authorship of text content, proofreading, and wordsmithing. The Client must provide all text content before this
  task begins.
• Provision of media, such as photographs and video clips from external sources (i.e. Google, Pinterest).` },

  { part: "workplan", level: 2, heading: "Task 3: Archiving Process", body:
`Prior to the termination of the Client's [old platform] subscription, all essential website entries (blogs, projects) determined by the Client will be stored back to the Client's local drive/server. All text/copywriting will be saved as Word Documents, and all images/media will be saved in the original format extracted from the website. Based on the proposed quote, the estimated maximum number of entries to archive is [n]. Refer to the optional scope for work beyond the maximum estimate.

We will prepare a list of all entries, including articles/blogs and projects that will be part of the archival process.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• List of all found articles/blogs and projects on the current website for the Client's review and confirmation.
• Structured Archive Folder containing all confirmed entries.` },
  { part: "workplan", level: 3, heading: "Exclusions", body:
`• Archiving does not include projects and blogs already included in the Task 2 scope.` },

  { part: "workplan", level: 2, heading: "Task 4: Website Launch & Turnover", body:
`Concurrent with the completion of Task 3, preparation for a full roll-out of the new website, porting of the domain onto the [platform] platform, and a single bulk redirect from all former website links to the new website. In addition, a one-hour walkthrough tutorial with a two-page web maintenance guide to navigate through the website's back end, with instructions for adding and editing website content.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• Live Website as seen on [https://example.ca].
• 2-Page high-level website maintenance guide.
• URL Mapping / Single Bulk Redirect` },
  { part: "workplan", level: 3, heading: "Meetings", body:
`• Website Walkthrough Tutorial` },
  { part: "workplan", level: 3, heading: "Exclusions", body:
`• Termination and/or modification of the existing [old platform] and Domain subscriptions` },

  { part: "workplan", level: 1, heading: "Optional Services" },
  { part: "workplan", level: 2, heading: "Task A: Full Archive", body:
`Concurrent with the Task 3 scope, archive all remaining entries (estimated [n] blogs and [n] projects) to the local drive/server. This task is only available before the [old platform] subscription is terminated.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• Additional folders and entries in the structured Archive Folder.` },

  { part: "workplan", level: 2, heading: "Task B: Additional Migration", body:
`Additional entries ([n] blogs or project posts), as determined by the Client, are to be migrated to the new website as needed. This task is only available before the [old platform] subscription is terminated, or if the material is available in the Client's archives.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• [n] Entries (blogs or projects) to the website` },

  { part: "workplan", level: 2, heading: "Task C: New Website Entries", body:
`Available after the Website Launch, add up to [n] new website entries (projects or blogs) with the content (text, media) provided by the Client.` },
  { part: "workplan", level: 3, heading: "Deliverables", body:
`• [n] New Entries (blogs or projects) to the website` },
];

const TASK_NAMES = [
  "Task 1: Template Exploration & Mock-ups",
  "Task 2: Website Design & Content Migration",
  "Task 3: Archiving Process",
  "Task 4: Website Launch & Turnover",
];

// The shared payment schedule names the milestone generically; for a website job the
// task it hangs off is known, so say it.
const PAYMENT_ROWS = [
  { pct: 20, label: "down payment to initiate work" },
  { pct: 30, label: "due upon approval of Task 2 Website Design/Final Presentation" },
  { pct: 50, label: "due before website launch" },
  { pct: "", label: "Optional Scopes are due upon completion of the specific task." },
];

export function webDesignSections() {
  const schedule = [
    { part: "schedule", level: 1, heading: "Project Schedule" },
    { part: "schedule", kind: "schedule", scale: "week", rows: scheduleSeedFor(TASK_NAMES) },
  ];
  const fees = FEES_BLOCKS().map((b) =>
    b.kind === "payment" ? { ...b, rows: PAYMENT_ROWS } : b);

  return [...COVER, ...WORKPLAN, ...schedule, ...fees, ...AGREEMENT_BLOCKS()]
    .map((b) => ({ ...b, ...(b.rows ? { rows: b.rows.map((r) => ({ ...r })) } : {}) }));
}

export function webDesignLineItems() {
  return TASK_NAMES.map((t) => ({
    description: t.replace(/^Task \d+: /, ""),
    qty: 0, unit_price: 0,
  }));
}
