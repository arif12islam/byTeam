"use client";

import { useActionState } from "react";

import { FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";

import { loadSampleDataAction, switchOffSampleAction } from "./actions";

/** Load the sample month, or switch the sample people off once they are not needed. */
export function SampleDataForm({ activeSamples }: { activeSamples: number }) {
  const [loadState, load, loading] = useActionState<FormState, FormData>(loadSampleDataAction, {});
  const [offState, off, switching] = useActionState<FormState, FormData>(switchOffSampleAction, {});

  if (activeSamples > 0) {
    return (
      <form action={off} className="flex flex-wrap items-center gap-4">
        <p className="w-full text-sm">
          {activeSamples} sample {activeSamples === 1 ? "person is" : "people are"} active. Switch them off before the real pilot starts.
        </p>
        <Button type="submit" variant="outline" pending={switching}>
          Switch off sample people
        </Button>
        <FormMessage state={offState.message || offState.error ? offState : loadState} />
      </form>
    );
  }

  return (
    <form action={load} className="flex flex-wrap items-center gap-4">
      <Button type="submit" variant="outline" pending={loading}>
        Load sample data
      </Button>
      <FormMessage state={loadState.message || loadState.error ? loadState : offState} />
    </form>
  );
}
