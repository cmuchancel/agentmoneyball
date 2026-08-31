export type PromptExample = { label: string; question: string };

/** Prompts shown in the empty conversation state. Keep these backed by regression-tested dataset semantics. */
export function conversationPrompts(pitcher: string): PromptExample[] {
  return [
    {
      label: "0–2 location map",
      question: `For pitcher ${pitcher} in 0–2 counts, plot every pitch with a valid location on a catcher-view strike zone. Color by pitch type and use marker shape for pitch outcome.`,
    },
    {
      label: "Whiff locations",
      question: `For pitcher ${pitcher}, plot every swing-and-miss pitch location. Color each point by pitch type and report total whiffs by pitch type.`,
    },
    {
      label: "Complete arsenal",
      question: `For pitcher ${pitcher}, summarize his complete arsenal by pitch type. Report pitch count, usage percentage, average release speed, average spin rate, average horizontal break, and average induced vertical break.`,
    },
  ];
}
