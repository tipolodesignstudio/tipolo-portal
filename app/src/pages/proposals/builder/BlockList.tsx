import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { KIND_LABEL, TOKEN_HELP, lineAmount, type Block, type LineItem, type Part } from "@/lib/doc";
import {
  BlockFrame, FeeEditor, OptionalEditor, PaymentEditor, ScheduleEditor, TextBlock,
} from "./BlockEditors";

/* The blocks of one part, editable in place: used by the proposal builder and the
   template editor alike. Blocks live in one array across all five parts; this shows and
   reorders only the ones in `part`. */
export function BlockList({ part, blocks, setBlocks, items, setItems, editable, onDirty, before }: {
  part: Part;
  blocks: Block[];
  setBlocks: React.Dispatch<React.SetStateAction<Block[]>>;
  items: LineItem[];
  setItems: (items: LineItem[]) => void;
  editable: boolean;
  onDirty: () => void;
  before?: React.ReactNode;
}) {
  const confirm = useConfirm();
  const [active, setActive] = React.useState(-1);
  const subtotal = items.reduce((s, li) => s + lineAmount(li), 0);

  const inPart = (i: number) => (blocks[i]?.part ?? "workplan") === part;
  const idx = blocks.map((_, i) => i).filter(inPart);

  const patch = (i: number, p: Partial<Block>) => { setBlocks((b) => b.map((x, k) => (k === i ? { ...x, ...p } : x))); onDirty(); };
  const move = (i: number, dir: -1 | 1) => {
    let j = i + dir;
    while (j >= 0 && j < blocks.length && !inPart(j)) j += dir;
    if (j < 0 || j >= blocks.length) return;
    setBlocks((b) => { const n = [...b]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setActive(j); onDirty();
  };
  const remove = async (i: number) => {
    const b = blocks[i];
    const what = b.heading || (b.kind ? KIND_LABEL[b.kind] : "") || "this block";
    if (!(await confirm({ title: "Delete block", message: `Delete “${what}”?`, confirm: "Delete", danger: true }))) return;
    setBlocks((x) => x.filter((_, k) => k !== i)); setActive(-1); onDirty();
  };
  const add = () => {
    let at = blocks.length;
    for (let i = blocks.length - 1; i >= 0; i--) if (inPart(i)) { at = i + 1; break; }
    setBlocks((b) => [...b.slice(0, at), { part, level: 2, heading: "", body: "" }, ...b.slice(at)]);
    setActive(at); onDirty();
  };
  const fees = (x: LineItem[]) => { setItems(x); onDirty(); };

  return (
    <>
      {before}
      <div className="space-y-2">
        {idx.length === 0 && <p className="px-4 py-6 text-sm text-ink-faint">Nothing in this part yet.</p>}
        {idx.map((i) => {
          const b = blocks[i];
          const onChange = (p: Partial<Block>) => patch(i, p);
          return (
            <BlockFrame key={i} block={b} editable={editable} active={active === i} onFocus={() => setActive(i)}
              onChange={onChange} onMove={(d) => move(i, d)} onDelete={() => remove(i)}>
              {b.kind === "payment" ? <PaymentEditor block={b} editable={editable} subtotal={subtotal} onChange={onChange} />
                : b.kind === "schedule" ? <ScheduleEditor block={b} editable={editable} onChange={onChange} />
                : b.kind === "optional-fees" ? <OptionalEditor block={b} editable={editable} onChange={onChange} />
                : b.kind === "fees" ? <FeeEditor items={items} editable={editable} onChange={fees} />
                : b.kind === "signature" ? <p className="text-[13px] text-ink-faint">Signs off the agreement. Printed from your business name — nothing to edit.</p>
                : <TextBlock block={b} editable={editable} active={active === i} onChange={onChange} />}
            </BlockFrame>
          );
        })}
      </div>
      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3 px-1">
          <Button variant="subtle" size="sm" onClick={add}><Plus />Add a block</Button>
          <span className="text-[12px] text-ink-faint">Tokens: {TOKEN_HELP.slice(0, 4).map((t) => <code key={t} className="mr-1 rounded bg-bg-alt px-1">{t}</code>)}</span>
        </div>
      )}
    </>
  );
}
