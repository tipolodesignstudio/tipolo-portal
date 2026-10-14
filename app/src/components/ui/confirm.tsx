import * as React from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";

type Ask = { title: string; message: React.ReactNode; confirm?: string; danger?: boolean };
type Pending = Ask & { resolve: (ok: boolean) => void };

const ConfirmContext = React.createContext<(a: Ask) => Promise<boolean>>(async () => false);

/* `const confirm = useConfirm(); if (await confirm({...})) …` — the app's one confirmation
   dialog, so every "Delete?" looks and behaves the same. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const ask = React.useCallback((a: Ask) => new Promise<boolean>((resolve) => setPending({ ...a, resolve })), []);
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null); };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <Dialog open onOpenChange={(v) => !v && close(false)} title={pending.title}
          footer={<>
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button autoFocus onClick={() => close(true)}
                    className={pending.danger ? "bg-bad hover:bg-bad/90" : undefined}>
              {pending.confirm ?? "Confirm"}
            </Button>
          </>}>
          <div className="text-sm text-ink-soft">{pending.message}</div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => React.useContext(ConfirmContext);
