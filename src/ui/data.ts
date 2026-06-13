import {
  Grid3X3,
  Images,
  LayoutGrid,
  Package,
  Palette,
  Printer,
  Users,
  GalleryHorizontalEnd,
  FileText,
  Zap,
  Heart
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModeType } from "@/types/template";

export interface HomeMode {
  id: ModeType;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const homeModes: HomeMode[] = [
  {
    id: "free",
    title: "עיצוב חופשי",
    description: "הוסף תמונות וטקסט בחופשיות על קנבס משותף.",
    icon: Palette,
    color: "#7C6FE0"
  },
  {
    id: "grid",
    title: "גריד",
    description: "סידור תמונות אוטומטי בתאים ובדפים.",
    icon: LayoutGrid,
    color: "#6FB5E0"
  },
  {
    id: "mask",
    title: "מסיכות",
    description: "מסגרות עגולות, צורות וחיתוכים לתמונות.",
    icon: Images,
    color: "#E06FA8"
  },
  {
    id: "collage",
    title: "קולאז'",
    description: "עיצוב קולאז' אוטומטי עם פריסות חכמות ותמונות מרובות.",
    icon: GalleryHorizontalEnd,
    color: "#E06F6F"
  },
  {
    id: "pdf_tools",
    title: "PDF Studio",
    description: "סידור, מיזוג, שינוי גודל והמרת קבצים ל-PDF.",
    icon: FileText,
    color: "#F0A040"
  },
  {
    id: "class_photo",
    title: "תמונת מחזור",
    description: "אשף כיתתי עם שמות, פנים ופריסה.",
    icon: Users,
    color: "#E0C050"
  },
  {
    id: "photo_print",
    title: "פיתוח תמונות",
    description: "הכנת תמונות להדפסה במידות מדויקות.",
    icon: Printer,
    color: "#52C97A"
  },
  {
    id: "product",
    title: "ספריית מוצרים",
    description: "עיצוב על מוצרים מוגדרים עם safe area.",
    icon: Package,
    color: "#E08A50"
  },
  {
    id: "batch_production",
    title: "ייצור סדרתי",
    description: "עצב תבנית אחת, הפק מאות עיצובים מותאמים אישית.",
    icon: Zap,
    color: "#a855f7"
  },
  {
    id: "blessing",
    title: "מצב ברכות",
    description: "עיצוב כרטיסי ברכה עם 906 ברכות, רקעים ומסגרות.",
    icon: Heart,
    color: "#E06FA8"
  },
  {
    id: "smart_photo_pack",
    title: "סידור תמונות חכם",
    description: "סידור תמונות בגדלים שונים בדף ללא חיתוך, עם ניצול שטח מיטבי.",
    icon: Images,
    color: "#4FB0C6"
  }
];

export const recentProjects = [
  "אלבום חתונה - דנה ויובל",
  "תמונת מחזור - כיתה ו׳1",
  "פוסטרים A2 - קמפיין יולי"
];

export const freeModeIcon = Grid3X3;
