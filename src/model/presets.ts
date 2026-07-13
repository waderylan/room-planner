import type { Footprint } from "./types";

export interface FurniturePreset {
  id: string;
  name: string;
  footprint: Footprint;
  height: number;
  color: string;
  elevation?: number;
}

const rect = (w: number, d: number): Footprint => ({ kind: "rect", w, d });

/** Real-world-ish default dimensions, in feet. */
export const FURNITURE_PRESETS: FurniturePreset[] = [
  { id: "sofa", name: "Sofa", footprint: rect(6, 3), height: 2.8, color: "#5b8def" },
  { id: "loveseat", name: "Loveseat", footprint: rect(4.5, 3), height: 2.8, color: "#5b8def" },
  { id: "armchair", name: "Armchair", footprint: rect(3, 3), height: 2.8, color: "#6d9ef0" },
  { id: "coffee-table", name: "Coffee table", footprint: rect(4, 2), height: 1.4, color: "#a8825a" },
  { id: "dining-table", name: "Dining table", footprint: rect(6, 3.5), height: 2.5, color: "#a8825a" },
  { id: "dining-chair", name: "Dining chair", footprint: rect(1.5, 1.5), height: 3, color: "#8a6a45" },
  { id: "bed-queen", name: "Bed (Queen)", footprint: rect(5, 6.7), height: 2, color: "#7fb3a3" },
  { id: "bed-king", name: "Bed (King)", footprint: rect(6.3, 6.7), height: 2, color: "#7fb3a3" },
  { id: "nightstand", name: "Nightstand", footprint: rect(1.5, 1.5), height: 2, color: "#8a6a45" },
  { id: "dresser", name: "Dresser", footprint: rect(4, 1.7), height: 3, color: "#8a6a45" },
  { id: "desk", name: "Desk", footprint: rect(4.5, 2.3), height: 2.5, color: "#8a6a45" },
  { id: "bookshelf", name: "Bookshelf", footprint: rect(3, 1), height: 6, color: "#6b5843" },
  { id: "tv-stand", name: "TV stand", footprint: rect(5, 1.3), height: 1.8, color: "#4a4a4a" },
  { id: "rug", name: "Rug", footprint: rect(8, 5), height: 0.05, color: "#c67c4e" },
  { id: "wardrobe", name: "Wardrobe", footprint: rect(4, 2), height: 6.5, color: "#6b5843" },
  { id: "fridge", name: "Fridge", footprint: rect(3, 2.7), height: 5.8, color: "#c7ccd1" },
  { id: "kitchen-island", name: "Kitchen island", footprint: rect(6, 3), height: 3, color: "#b7bfc7" },
  { id: "toilet", name: "Toilet", footprint: rect(1.7, 2.3), height: 2.4, color: "#e3e7ea" },
  { id: "sink", name: "Sink", footprint: rect(2, 1.7), height: 2.8, color: "#e3e7ea" },
  { id: "bathtub", name: "Bathtub", footprint: rect(2.7, 5), height: 1.5, color: "#e3e7ea" },
  { id: "plant", name: "Plant", footprint: { kind: "circle", r: 1 }, height: 3.5, color: "#4f8a52" },
];

export const CUSTOM_PRESET: FurniturePreset = {
  id: "custom",
  name: "Custom",
  footprint: rect(3, 2),
  height: 2.5,
  color: "#8a8f98",
};
