export type PromptExample = { label: string; question: string };

/** Prompts shown in the empty conversation state. Keep these backed by regression-tested dataset semantics. */
export function conversationPrompts(pitcher: string): PromptExample[] {
  return [
    {
      label: "0–2 location map",
      question: `Show ${pitcher}'s pitch locations in 0-2 counts, colored by pitch type and shaped by pitch outcome.`,
    },
    {
      label: "Whiff locations",
      question: `Where does ${pitcher} get swings and misses? Render the strike zone and color by pitch type.`,
    },
    {
      label: "Pitch mix",
      question: `How does ${pitcher}'s pitch mix change by count?`,
    },
  ];
}
