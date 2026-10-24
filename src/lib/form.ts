/** What a server action hands back to its form. */
export type FormState = {
  error?: string;
  message?: string;
  /**
   * The submitted text, sent back with an error. React clears uncontrolled
   * fields after an action finishes, so the form uses these as the defaults to
   * keep what the person typed.
   */
  values?: Record<string, string>;
};

/** Text fields from a submitted form. Never use it for forms that hold a password. */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

export function formError(formData: FormData, error: string): FormState {
  return { error, values: formValues(formData) };
}

/** The value to show in a field: what was just submitted, else the saved one. */
export function fieldValue(state: FormState, name: string, saved?: string | number | null): string {
  return state.values?.[name] ?? (saved === null || saved === undefined ? "" : String(saved));
}
