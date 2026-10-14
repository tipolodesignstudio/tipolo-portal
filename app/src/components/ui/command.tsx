import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command as Cmdk } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* The Cmd+K palette: a dialog wrapping cmdk's list. */
export function CommandDialog({ open, onOpenChange, children, shouldFilter = true }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
  shouldFilter?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-[14vh] z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search the portal</Dialog.Title>
          <Cmdk shouldFilter={shouldFilter} className="flex flex-col">{children}</Cmdk>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const CommandInput = (props: React.ComponentProps<typeof Cmdk.Input>) => (
  <div className="flex items-center gap-2 border-b border-border px-4">
    <Search className="size-4 text-ink-faint" />
    <Cmdk.Input
      {...props}
      className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
    />
  </div>
);

export const CommandList = ({ className, ...props }: React.ComponentProps<typeof Cmdk.List>) => (
  <Cmdk.List className={cn("max-h-[360px] overflow-y-auto p-2", className)} {...props} />
);

export const CommandEmpty = (props: React.ComponentProps<typeof Cmdk.Empty>) => (
  <Cmdk.Empty className="px-3 py-8 text-center text-sm text-ink-faint" {...props} />
);

export const CommandGroup = ({ className, ...props }: React.ComponentProps<typeof Cmdk.Group>) => (
  <Cmdk.Group
    className={cn(
      "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2",
      "[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium",
      "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-ink-faint",
      className,
    )}
    {...props}
  />
);

export const CommandItem = ({ className, ...props }: React.ComponentProps<typeof Cmdk.Item>) => (
  <Cmdk.Item
    className={cn(
      "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm text-ink",
      "data-[selected=true]:bg-bg-alt [&_svg]:size-4 [&_svg]:text-ink-faint",
      className,
    )}
    {...props}
  />
);
