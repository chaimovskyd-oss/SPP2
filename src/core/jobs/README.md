# מערכת Jobs

תור עבודות כללי עם status, progress, priority, cancellation, retry, per-item errors ו־concurrency limit.

משתמשים בה: import, preview generation, export, smart crop, batch fill וכל פעולה כבדה עתידית.

אסור לעשות: להריץ עבודות כבדות ישירות ב־UI thread בלי Job, או לעדכן UI מתוך worker ללא event/progress מסודר.

הרחבה עתידית: persistence לתור, pause/resume אמיתי, ו־bridges ל־TypeScript workers ול־Python.
