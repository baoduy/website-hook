"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DeleteWebhookDialog({
  open,
  endpointUrl,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  endpointUrl: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[440px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
          <AlertDialogDescription>
            Every captured request is deleted with it, and the endpoint answers 404 from then on.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {endpointUrl ? (
          <p className="bg-muted rounded-md p-3 font-mono text-[11.5px] break-all">{endpointUrl}</p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            Delete webhook
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
