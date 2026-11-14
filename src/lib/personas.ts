import type { Persona } from "./types";

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "apressado",
    name: "O Apressado",
    description:
      "Lê títulos e botões, prioriza velocidade e perde a paciência com textos longos.",
    technicalLevel: "medium",
  },
  {
    id: "baixa-familiaridade",
    name: "Baixa Familiaridade Digital",
    description:
      "Tem dificuldade com termos técnicos, fontes pequenas e ícones sem rótulo.",
    technicalLevel: "low",
  },
  {
    id: "cacador-de-bugs",
    name: "O Caçador de Bugs",
    description:
      "Explora limites, formulários vazios, links quebrados e estados inconsistentes.",
    technicalLevel: "high",
  },
];
