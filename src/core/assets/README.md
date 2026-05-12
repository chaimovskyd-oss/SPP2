# מערכת נכסים

מנהלת את מחזור החיים של תמונות ונכסים: original לייצוא, preview לקנבס, thumbnail לפאנלים, metadata, זיהוי כפילויות, missing/relink ו־cache מוגבל.

משתמשים בה: import, rendering, export, save/recovery ו־relink.

אסור לעשות: להציג original כבד בקנבס בזמן עריכה רגילה, ליצור metadata אד־הוק בקומפוננטות, או לטעון נכסים בלי לעבור דרך resolver.

הרחבה עתידית: לחבר worker אמיתי ליצירת previews, להוסיף מגבלת זיכרון לפי פרויקט, ולשמור קבצים פיזיים בתוך `.spp`.
