import type { BlessingTemplate, BlessingTemplateId } from "@/types/blessing";

export const BLESSING_TEMPLATES: BlessingTemplate[] = [
  {
    id: "classic_card",
    name: "כרטיס ברכה קלאסי",
    defaultEvent: "כללי",
    titleFontFamily: "Frank Ruhl Libre",
    bodyFontFamily: "Assistant",
    titleFontSize: 88,
    bodyFontSize: 52,
    titleColor: "#2c1a0e",
    bodyColor: "#3a2a1a",
    titleFontWeight: 700,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "cream_elegant.png",
    showFrame: false,
    signatureEnabled: true
  },
  {
    id: "birthday",
    name: "יום הולדת",
    defaultEvent: "יום הולדת",
    titleFontFamily: "Heebo",
    bodyFontFamily: "Heebo",
    titleFontSize: 90,
    bodyFontSize: 54,
    titleColor: "#7c2b8b",
    bodyColor: "#2d1a4e",
    titleFontWeight: 800,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "birthday_fun.png",
    showFrame: false,
    signatureEnabled: true
  },
  {
    id: "brit_bar_mitzvah",
    name: "ברית / בר מצווה",
    defaultEvent: "בר/בת מצווה",
    titleFontFamily: "Frank Ruhl Libre",
    bodyFontFamily: "Frank Ruhl Libre",
    titleFontSize: 82,
    bodyFontSize: 48,
    titleColor: "#0d3b6e",
    bodyColor: "#1a2e4a",
    titleFontWeight: 700,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "bar_mitzvah_blue.png",
    showFrame: true,
    defaultFrameFilename: "gold_double.png",
    signatureEnabled: true
  },
  {
    id: "teacher",
    name: "מורה / גננת",
    defaultEvent: "מורה/גננת",
    titleFontFamily: "Assistant",
    bodyFontFamily: "Assistant",
    titleFontSize: 86,
    bodyFontSize: 52,
    titleColor: "#1a4a2e",
    bodyColor: "#2a3a2a",
    titleFontWeight: 700,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "elegant_gold.png",
    showFrame: false,
    signatureEnabled: true
  },
  {
    id: "army",
    name: "גיוס",
    defaultEvent: "גיוס",
    titleFontFamily: "Heebo",
    bodyFontFamily: "Heebo",
    titleFontSize: 88,
    bodyFontSize: 52,
    titleColor: "#1a2e0e",
    bodyColor: "#1a2e0e",
    titleFontWeight: 800,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "army_soft.png",
    showFrame: false,
    signatureEnabled: true
  },
  {
    id: "wedding",
    name: "חתונה / אירוסין",
    defaultEvent: "חתונה",
    titleFontFamily: "Frank Ruhl Libre",
    bodyFontFamily: "Frank Ruhl Libre",
    titleFontSize: 82,
    bodyFontSize: 48,
    titleColor: "#4a1a2e",
    bodyColor: "#3a1a2e",
    titleFontWeight: 700,
    bodyFontWeight: 400,
    defaultBackgroundFilename: "love_soft.png",
    showFrame: true,
    defaultFrameFilename: "red_corner.png",
    signatureEnabled: true
  }
];

export function getTemplate(id: BlessingTemplateId): BlessingTemplate {
  return BLESSING_TEMPLATES.find((t) => t.id === id) ?? BLESSING_TEMPLATES[0];
}
