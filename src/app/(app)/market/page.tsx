import { Suspense } from "react";
import { MarketView } from "./market-view";

export default function MarketPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading market…</p>}>
      <MarketView />
    </Suspense>
  );
}
