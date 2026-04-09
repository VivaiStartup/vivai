export const WATERING_STRATEGY_META: Record<
  string,
  { label: string; hint?: string }
> = {
  CHECK_SOIL: {
    label: "Controlla il terriccio",
    hint: "Valuta l’umidità prima di annaffiare.",
  },
  KEEP_LIGHTLY_MOIST: {
    label: "Mantieni leggermente umido",
    hint: "Il substrato non dovrebbe asciugare del tutto.",
  },
  WATER_REGULARLY: {
    label: "Annaffia con regolarità",
    hint: "La pianta tende a gradire irrigazioni costanti.",
  },
  LET_DRY_BETWEEN: {
    label: "Lascia asciugare tra due irrigazioni",
    hint: "Aspetta che il terriccio asciughi almeno in parte.",
  },
  SPARSE_WATERING: {
    label: "Annaffia poco e di rado",
    hint: "Meglio scarse irrigazioni che eccessi d’acqua.",
  },
};

export function getWateringStrategyMeta(value?: string | null): {
  label: string;
  hint?: string;
} | null {
  if (!value) return null;
  return WATERING_STRATEGY_META[value] ?? {
    label: value,
  };
}