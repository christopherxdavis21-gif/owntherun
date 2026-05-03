import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Lock, Battery } from "lucide-react";

const SEEN_KEY = "catchup:run-primer-seen";

export function hasSeenRunPrimer(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage?.getItem(SEEN_KEY) === "1";
}

export function markRunPrimerSeen() {
  if (typeof window === "undefined") return;
  window.localStorage?.setItem(SEEN_KEY, "1");
}

/**
 * Shown the first time a user taps "Start". Explains why we ask for location
 * (and Always-Allow on native iOS) before the system permission prompt fires.
 *
 * Required by Apple App Review for any app that requests background location.
 */
export function RunPermissionPrimer({
  open,
  onContinue,
  onCancel,
}: {
  open: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  // Re-mount safety: ensure scroll lock releases if parent unmounts mid-open
  const [internalOpen, setInternalOpen] = useState(open);
  useEffect(() => setInternalOpen(open), [open]);

  return (
    <Dialog
      open={internalOpen}
      onOpenChange={(o) => {
        if (!o) {
          setInternalOpen(false);
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Before we start tracking
          </DialogTitle>
          <DialogDescription>
            Catch Up uses your phone's GPS to record your route, distance, pace,
            and elevation. Here's exactly what that means.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2 text-sm">
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium text-foreground">Location while running</div>
              <div className="text-muted-foreground">
                We only read your location while a run is active.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium text-foreground">"Always Allow" (recommended)</div>
              <div className="text-muted-foreground">
                Lets tracking continue when your screen locks or you switch apps.
                Without it, runs pause as soon as the screen goes off.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Battery className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium text-foreground">Stops when you stop</div>
              <div className="text-muted-foreground">
                The moment you tap Stop, location access ends. We never track
                you between runs.
              </div>
            </div>
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Not now
          </Button>
          <Button onClick={onContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
