import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path
from PIL import ImageTk, Image

from .models import Product, DEFAULT_PRODUCTION
from .storage import (
    load_products,
    save_products,
    import_csv,
    copy_mask_to_library,
    export_selected_product,
    ROOT,
    slugify,
)
from .image_utils import get_thumbnail_from_url, remove_white_background

PRINTER_TYPES = ["", "פלוטר", "סובלימציה", "פיתוח תמונות", "קוניקה"]
ORIENTATIONS = ["any", "portrait", "landscape", "square"]

class ProductLibraryApp:
    def __init__(self, root):
        self.root = root
        self.root.title("SPP Product Library - Standalone v1.9.2 Details Scroll Left")
        self.root.geometry("1320x830")

        style = ttk.Style(self.root)
        style.configure("Product.Treeview", rowheight=92)
        style.configure("Vertical.TScrollbar", arrowsize=22, width=22)
        style.configure("Horizontal.TScrollbar", arrowsize=18, width=18)

        self.products = load_products()
        self.filtered = []
        self.selected = None
        self.thumb_refs = {}
        self.detail_photo = None
        self.mask_photo = None

        self.build_ui()
        self.refresh_filters()
        self.apply_filters()

    def build_ui(self):
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill="x")

        ttk.Label(top, text="Search:").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self.apply_filters())
        ttk.Entry(top, textvariable=self.search_var, width=46).pack(side="left", padx=6)

        ttk.Button(top, text="Refresh", command=self.reload_products).pack(side="left", padx=4)
        ttk.Button(top, text="Import CSV", command=self.import_csv).pack(side="left", padx=4)
        ttk.Button(top, text="+ Add Product", command=self.add_product).pack(side="left", padx=4)
        ttk.Button(top, text="Batch Edit", command=self.bulk_edit_category).pack(side="left", padx=4)
        ttk.Button(top, text="Export Selected for SPP", command=self.export_selected).pack(side="right", padx=4)

        main = ttk.Frame(self.root, padding=8)
        main.pack(fill="both", expand=True)
        main.columnconfigure(0, weight=1)
        main.columnconfigure(1, weight=3)
        main.columnconfigure(2, weight=2)
        main.rowconfigure(0, weight=1)

        left = ttk.LabelFrame(main, text="Filters", padding=8)
        left.pack(side="left", fill="y")

        ttk.Label(left, text="Category").pack(anchor="w")
        self.cat_var = tk.StringVar(value="All")
        self.cat_combo = ttk.Combobox(left, textvariable=self.cat_var, state="readonly", width=24)
        self.cat_combo.pack(pady=4)
        self.cat_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())

        ttk.Label(left, text="Orientation").pack(anchor="w", pady=(12, 0))
        self.ori_var = tk.StringVar(value="All")
        self.ori_combo = ttk.Combobox(left, textvariable=self.ori_var, state="readonly", values=["All"] + ORIENTATIONS, width=24)
        self.ori_combo.pack(pady=4)
        self.ori_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())

        ttk.Label(left, text="Printer Type").pack(anchor="w", pady=(12, 0))
        self.printer_var = tk.StringVar(value="All")
        self.printer_combo = ttk.Combobox(left, textvariable=self.printer_var, state="readonly", values=["All"] + [p for p in PRINTER_TYPES if p], width=24)
        self.printer_combo.pack(pady=4)
        self.printer_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())

        ttk.Label(left, text="Mask").pack(anchor="w", pady=(12, 0))
        self.mask_var = tk.StringVar(value="All")
        self.mask_combo = ttk.Combobox(left, textvariable=self.mask_var, state="readonly", values=["All", "With mask", "Without mask"], width=24)
        self.mask_combo.pack(pady=4)
        self.mask_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())

        ttk.Label(left, text="Sort").pack(anchor="w", pady=(12, 0))
        self.sort_var = tk.StringVar(value="Name")
        self.sort_combo = ttk.Combobox(left, textvariable=self.sort_var, state="readonly", values=["Name", "Category", "Price low-high", "Price high-low", "Size", "Printer type"], width=24)
        self.sort_combo.pack(pady=4)
        self.sort_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())

        center = ttk.LabelFrame(main, text="Products", padding=8)
        center.pack(side="left", fill="both", expand=True, padx=8)

        cols = ("name", "category", "size", "price", "orientation", "printer", "press_temp", "press_time")
        self.tree = ttk.Treeview
        self.tree["displaycolumns"] = ("name","category","size","price","orientation","printer","press_temp","press_time")(center, columns=cols, show="tree headings", height=18, style="Product.Treeview")
        self.tree.heading("#0", text="Image")
        self.tree.column("#0", width=105, minwidth=95, stretch=False)
        for c, title, w in [
            ("name", "Name", 250),
            ("category", "Category", 150),
            ("size", "Size", 95),
            ("price", "Price", 75),
            ("orientation", "Orientation", 95),
            ("printer", "Printer", 130),
            ("press_temp", "Press Temp", 95),
            ("press_time", "Press Time", 95),
        ]:
            self.tree.heading(c, text=title)
            self.tree.column(c, width=w, minwidth=60)

        tree_scroll_y = ttk.Scrollbar(center, orient="vertical", command=self.tree.yview, style="Vertical.TScrollbar")
        tree_scroll_x = ttk.Scrollbar(center, orient="horizontal", command=self.tree.xview, style="Horizontal.TScrollbar")
        self.tree.configure(yscrollcommand=tree_scroll_y.set, xscrollcommand=tree_scroll_x.set)
        tree_scroll_y.grid(row=0, column=0, sticky="ns")
        self.tree.grid(row=0, column=1, sticky="nsew")
        for col in ("name","category"):
            self.tree.column(col, stretch=True)
        for col in ("size","price","orientation","printer","press_temp","press_time"):
            self.tree.column(col, stretch=False)

        tree_scroll_x.grid(row=1, column=1, sticky="ew")
        center.rowconfigure(0, weight=1)
        center.columnconfigure(1, weight=1)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        self.tree.bind("<Double-1>", lambda _e: self.export_selected())
        self.tree.bind("<MouseWheel>", self._on_mousewheel)

        right = ttk.LabelFrame(main, text="Product Details", padding=8)
        right.pack(side="right", fill="both")
        right.update_idletasks()
        right.minsize(300, 400)
        right.configure(width=430)
        right.pack_propagate(False)

        self.detail_img = ttk.Label(right, text="No image")
        self.detail_img.pack(pady=8)

        details_outer = ttk.LabelFrame(right, text="Details / פרטים — פס גלילה כחול משמאל", padding=4)
        details_outer.pack(fill="both", expand=True, pady=(4, 6))

        self.detail_text = tk.Text(
            details_outer,
            width=36,
            height=19,
            wrap="word",
            font=("Arial", 10),
            bg="#F8FAFC",
            relief="solid",
            bd=1,
            padx=8,
            pady=8
        )

        # Classic tk.Scrollbar is intentionally used because ttk scrollbar width/colors
        # are unreliable on Windows themes.
        self.detail_scroll = tk.Scrollbar(
            details_outer,
            orient="vertical",
            command=self.detail_text.yview,
            width=20,
            bg="#0F62FE",
            troughcolor="#D1D5DB",
            activebackground="#003EA8",
            relief="raised",
            bd=2
        )

        self.detail_text.configure(yscrollcommand=self.detail_scroll.set)
        # Put the Product Details scrollbar on the LEFT side so it is never clipped by the window edge.
        self.detail_scroll.pack(side="left", fill="y", padx=(0, 6))
        self.detail_text.pack(side="left", fill="both", expand=True)

        # Color tags for clear sections.
        self.detail_text.tag_configure("header", font=("Arial", 11, "bold"), foreground="#111827")
        self.detail_text.tag_configure("print_bg", background="#E8F4FF", foreground="#111827", spacing1=4, spacing3=4)
        self.detail_text.tag_configure("price_bg", background="#FFF4D6", foreground="#111827", spacing1=4, spacing3=4)
        self.detail_text.tag_configure("size_bg", background="#EAF8E8", foreground="#111827", spacing1=4, spacing3=4)
        self.detail_text.tag_configure("info_bg", background="#F2EAFE", foreground="#111827", spacing1=4, spacing3=4)

        self.detail_text.bind("<Enter>", lambda _e: self.detail_text.bind_all("<MouseWheel>", self._on_detail_text_mousewheel))
        self.detail_text.bind("<Leave>", lambda _e: self.detail_text.unbind_all("<MouseWheel>"))

        mask_frame = ttk.LabelFrame(right, text="Mask Preview", padding=6)
        mask_frame.pack(fill="x", pady=(10, 4))
        self.mask_preview = ttk.Label(mask_frame, text="No mask")
        self.mask_preview.pack(pady=4)

        ttk.Button(right, text="Open / Export Product Setup", command=self.export_selected).pack(fill="x", pady=(10, 4))
        ttk.Button(right, text="Edit Product", command=self.edit_selected).pack(fill="x", pady=4)
        ttk.Button(right, text="Attach / Replace Mask", command=self.attach_mask).pack(fill="x", pady=4)
        ttk.Button(right, text="Remove Mask", command=self.remove_mask).pack(fill="x", pady=4)
        ttk.Button(right, text="Duplicate Product", command=self.duplicate_selected).pack(fill="x", pady=4)
        ttk.Button(right, text="Delete Product", command=self.delete_selected).pack(fill="x", pady=4)

    def _on_detail_text_mousewheel(self, event):
        self.detail_text.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _on_mousewheel(self, event):
        self.tree.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def reload_products(self):
        self.products = load_products()
        self.refresh_filters()
        self.apply_filters()
        messagebox.showinfo("Refreshed", "Product library reloaded from JSON.")

    def refresh_filters(self):
        cats = sorted({p.category for p in self.products if p.category})
        self.cat_combo["values"] = ["All"] + cats
        if self.cat_var.get() not in self.cat_combo["values"]:
            self.cat_var.set("All")

    def apply_filters(self):
        q = self.search_var.get().strip().lower()
        cat = self.cat_var.get()
        ori = self.ori_var.get()
        mask = self.mask_var.get()
        printer = self.printer_var.get()
        items = []
        for p in self.products:
            prod = p.production or {}
            text = " ".join([
                p.name, p.category, p.material, p.orientation,
                str(p.width_cm), str(p.height_cm), str(p.price),
                " ".join(p.audience), p.tips, str(prod.get("printer_type", "")), str(prod.get("notes", ""))
            ]).lower()
            if q and q not in text:
                continue
            if cat != "All" and p.category != cat:
                continue
            if ori != "All" and p.orientation != ori:
                continue
            if printer != "All" and (p.production or {}).get("printer_type", "") != printer:
                continue
            if mask == "With mask" and not p.mask_path:
                continue
            if mask == "Without mask" and p.mask_path:
                continue
            items.append(p)

        sort = self.sort_var.get()
        if sort == "Name":
            items.sort(key=lambda p: p.name)
        elif sort == "Category":
            items.sort(key=lambda p: (p.category, p.name))
        elif sort == "Price low-high":
            items.sort(key=lambda p: p.price)
        elif sort == "Price high-low":
            items.sort(key=lambda p: -p.price)
        elif sort == "Size":
            items.sort(key=lambda p: (p.width_cm * p.height_cm, p.name))
        elif sort == "Printer type":
            items.sort(key=lambda p: ((p.production or {}).get("printer_type", ""), p.name))
        self.filtered = items
        self.render_tree()

    def render_tree(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        self.thumb_refs.clear()
        for idx, p in enumerate(self.filtered):
            url = p.mockup_image_url or p.image_url
            photo = None
            img = get_thumbnail_from_url(url, (82, 82)) if url else None
            if img:
                photo = ImageTk.PhotoImage(img)
                self.thumb_refs[p.id] = photo
            prod = p.production or {}
            row_values = (
                str(p.name or ""), str(p.category or ""), f"{float(p.width_cm):g}×{float(p.height_cm):g}",
                f"₪{float(p.price):g}", str(p.orientation or "any"), str(prod.get("printer_type", "")),
                (str(prod.get("press_temperature_celsius", "")) + "°") if prod.get("press_temperature_celsius", "") else "",
                (str(prod.get("press_time_seconds", "")) + "s") if prod.get("press_time_seconds", "") else ""
            )
            insert_kwargs = {"text": "", "values": row_values}
            if photo is not None:
                insert_kwargs["image"] = photo
            iid = str(p.id or f"row_{idx}")
            try:
                self.tree.insert("", "end", iid=iid, **insert_kwargs)
            except tk.TclError:
                self.tree.insert("", "end", **insert_kwargs)

    def clear_details_frame(self):
        if hasattr(self, "detail_text"):
            self.detail_text.config(state="normal")
            self.detail_text.delete("1.0", "end")
            self.detail_text.config(state="disabled")

    def get_by_id(self, pid):
        return next((p for p in self.products if str(p.id) == str(pid)), None)

    def on_select(self, _=None):
        sel = self.tree.selection()
        if not sel:
            return
        self.selected = self.get_by_id(sel[0])
        if self.selected:
            self.show_details()

    def show_details(self):
        p = self.selected
        if not p:
            return

        url = p.mockup_image_url or p.image_url
        img = get_thumbnail_from_url(url, (200, 180)) if url else None
        if img:
            self.detail_photo = ImageTk.PhotoImage(img)
            self.detail_img.config(image=self.detail_photo, text="")
        else:
            self.detail_photo = None
            self.detail_img.config(image="", text="No image")

        prod = p.production or {}
        bleed = float(p.bleed_cm or 0)
        canvas_w = p.width_cm + bleed * 2
        canvas_h = p.height_cm + bleed * 2

        self.detail_text.config(state="normal")
        self.detail_text.delete("1.0", "end")

        def add_section(title, lines, tag):
            self.detail_text.insert("end", f"{title}\n", ("header", tag))
            for line in lines:
                if line is None or str(line).strip() == "":
                    continue
                self.detail_text.insert("end", f"{line}\n", tag)
            self.detail_text.insert("end", "\n")

        press_enabled = bool(prod.get("press_enabled"))
        press_lines = [
            f"סוג מדפסת: {prod.get('printer_type', '') or 'לא הוגדר'}",
            f"הוראות כבישה: {'כן' if press_enabled else 'לא'}",
        ]
        if press_enabled or prod.get("press_temperature_celsius") or prod.get("press_time_seconds"):
            press_lines += [
                f"טמפרטורה במכבש: {prod.get('press_temperature_celsius', '')}°" if prod.get("press_temperature_celsius") else "",
                f"זמן במכבש: {prod.get('press_time_seconds', '')} שניות" if prod.get("press_time_seconds") else "",
                f"הערות כבישה: {prod.get('press_notes', '')}" if prod.get("press_notes") else "",
            ]
        press_lines.append(
            f"הוראות כלליות: {prod.get('general_notes', '')}"
            if prod.get("general_notes")
            else "הוראות כלליות: לא הוגדר"
        )

        add_section("הוראות הדפסה וייצור", press_lines, "print_bg")
        add_section("מחיר", [
            f"מחיר: ₪{p.price:g}" if p.price else "מחיר: לא הוגדר",
        ], "price_bg")
        add_section("מידות ובליד", [
            f"מידת מוצר: {p.width_cm:g} × {p.height_cm:g} ס״מ",
            f"Bleed: {bleed:g} ס״מ מכל צד",
            f"גודל קנבס כולל בליד: {canvas_w:g} × {canvas_h:g} ס״מ",
            f"Safe Area: {p.width_cm:g} × {p.height_cm:g} ס״מ",
            f"Orientation: {p.orientation}",
        ], "size_bg")
        add_section("מידע נוסף", [
            f"שם מוצר: {p.name}",
            f"קטגוריה: {p.category}",
            f"חומר: {p.material}",
            f"קהל יעד: {', '.join(p.audience)}",
            f"מסיכה: {p.mask_path or 'אין'}",
            f"ID: {p.id}",
        ], "info_bg")

        self.detail_text.config(state="disabled")
        self.detail_text.yview_moveto(0)
        self.show_mask_preview(p)

    def show_mask_preview(self, product):
        if not product or not product.mask_path:
            self.mask_preview.config(image="", text="No mask")
            self.mask_photo = None
            return
        mask_file = ROOT / product.mask_path
        if not mask_file.exists():
            self.mask_preview.config(image="", text="Mask file not found")
            self.mask_photo = None
            return
        if mask_file.suffix.lower() == ".svg":
            self.mask_preview.config(image="", text=f"SVG mask attached:\n{mask_file.name}")
            self.mask_photo = None
            return
        try:
            img = Image.open(mask_file).convert("RGBA")
            img.thumbnail((220, 150))
            bg = Image.new("RGBA", img.size, (245, 245, 245, 255))
            bg.alpha_composite(img)
            self.mask_photo = ImageTk.PhotoImage(bg.convert("RGB"))
            self.mask_preview.config(image=self.mask_photo, text="")
        except Exception as e:
            self.mask_preview.config(image="", text=f"Cannot preview mask:\n{e}")
            self.mask_photo = None

    def import_csv(self):
        path = filedialog.askopenfilename(filetypes=[("CSV files", "*.csv")])
        if not path:
            return
        added, updated, skipped = import_csv(path)
        self.products = load_products()
        self.refresh_filters()
        self.apply_filters()
        messagebox.showinfo("Import complete", f"Added: {added}\nUpdated: {updated}\nSkipped without size: {skipped}")

    def _entry(self, parent, label, value="", row=0, width=48):
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=6, pady=4)
        e = ttk.Entry(parent, width=width)
        e.insert(0, "" if value is None else str(value))
        e.grid(row=row, column=1, sticky="ew", padx=6, pady=4)
        return e

    def product_form(self, product=None):
        win = tk.Toplevel(self.root)
        win.title("Edit Product" if product else "Add Product")
        win.geometry("680x760")
        win.columnconfigure(0, weight=1)
        canvas = tk.Canvas(win)
        scroll = ttk.Scrollbar(win, orient="vertical", command=canvas.yview, style="Vertical.TScrollbar")
        content = ttk.Frame(canvas, padding=10)
        content.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=content, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        values = product.to_dict() if product else {}
        prod_vals = values.get("production", {}) or {}
        fields = {}
        row = 0
        ttk.Label(content, text="Basic Product Data", font=("TkDefaultFont", 11, "bold")).grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 8)); row += 1
        for key, label in [
            ("id", "ID"), ("name", "Name"), ("category", "Category"), ("price", "Price"),
            ("width_cm", "Width cm"), ("height_cm", "Height cm"), ("material", "Material"),
            ("audience", "Audience comma separated"), ("image_url", "Image URL"), ("mockup_image_url", "Mockup URL"),
        ]:
            val = values.get(key, "")
            if isinstance(val, list): val = ", ".join(val)
            fields[key] = self._entry(content, label, val, row); row += 1

        ttk.Label(content, text="Orientation").grid(row=row, column=0, sticky="w", padx=6, pady=4)
        fields["orientation"] = ttk.Combobox(content, values=ORIENTATIONS, state="readonly", width=45)
        fields["orientation"].set(values.get("orientation", "any") or "any")
        fields["orientation"].grid(row=row, column=1, sticky="ew", padx=6, pady=4); row += 1

        fields["bleed_cm"] = self._entry(content, "Bleed cm each side", values.get("bleed_cm", 0.2), row); row += 1

        ttk.Separator(content).grid(row=row, column=0, columnspan=2, sticky="ew", pady=10); row += 1
        ttk.Label(content, text="Production Instructions", font=("TkDefaultFont", 11, "bold")).grid(row=row, column=0, columnspan=2, sticky="w", pady=(0, 8)); row += 1
        ttk.Label(content, text="Printer Type").grid(row=row, column=0, sticky="w", padx=6, pady=4)
        fields["printer_type"] = ttk.Combobox(content, values=PRINTER_TYPES, state="readonly", width=45)
        fields["printer_type"].set(prod_vals.get("printer_type", ""))
        fields["printer_type"].grid(row=row, column=1, sticky="ew", padx=6, pady=4); row += 1
        fields["press_temperature_celsius"] = self._entry(content, "Press Temperature Celsius", prod_vals.get("press_temperature_celsius", prod_vals.get("heat_celsius", "")), row); row += 1
        fields["press_time_seconds"] = self._entry(content, "Press Time Seconds", prod_vals.get("press_time_seconds", prod_vals.get("time_seconds", "")), row); row += 1
        press_enabled_var = tk.BooleanVar(value=bool(prod_vals.get("press_enabled", prod_vals.get("mirror_required", False))))
        ttk.Checkbutton(content, text="Product requires heat press", variable=press_enabled_var).grid(row=row, column=1, sticky="w", padx=6, pady=4); row += 1

        ttk.Label(content, text="Production Notes").grid(row=row, column=0, sticky="nw", padx=6, pady=4)
        prod_notes = tk.Text(content, width=48, height=5, wrap="word")
        prod_notes.insert("1.0", str(prod_vals.get("press_notes", prod_vals.get("notes", "")) or ""))
        prod_notes.grid(row=row, column=1, sticky="ew", padx=6, pady=4); row += 1

        ttk.Label(content, text="General Notes / Tips").grid(row=row, column=0, sticky="nw", padx=6, pady=4)
        tips_text = tk.Text(content, width=48, height=5, wrap="word")
        tips_text.insert("1.0", str(values.get("tips", "") or ""))
        tips_text.grid(row=row, column=1, sticky="ew", padx=6, pady=4); row += 1

        result = {"product": None}
        def save():
            try:
                aud = [x.strip() for x in fields["audience"].get().split(",") if x.strip()]
                prod = dict(DEFAULT_PRODUCTION)
                prod.update({
                    "printer_type": fields["printer_type"].get(),
                    "press_temperature_celsius": fields["press_temperature_celsius"].get().strip(),
                    "press_time_seconds": fields["press_time_seconds"].get().strip(),
                    "press_enabled": bool(press_enabled_var.get()),
                    "press_notes": prod_notes.get("1.0", "end").strip(),
                })
                p = Product(
                    id=fields["id"].get().strip() or slugify(fields["name"].get()),
                    name=fields["name"].get().strip(), category=fields["category"].get().strip(),
                    price=float(fields["price"].get() or 0), width_cm=float(fields["width_cm"].get() or 0),
                    height_cm=float(fields["height_cm"].get() or 0), orientation=fields["orientation"].get().strip() or "any",
                    material=fields["material"].get().strip(), audience=aud,
                    tips=tips_text.get("1.0", "end").strip(), image_url=fields["image_url"].get().strip(),
                    mockup_image_url=fields["mockup_image_url"].get().strip(), mask_path=product.mask_path if product else "",
                    bleed_cm=float(fields["bleed_cm"].get() or 0.2), production=prod,
                )
                if not p.name or p.width_cm <= 0 or p.height_cm <= 0:
                    raise ValueError("Name and valid width/height are required")
                result["product"] = p
                win.destroy()
            except Exception as e:
                messagebox.showerror("Invalid product", str(e))
        ttk.Button(content, text="Save Product", command=save).grid(row=row, column=1, sticky="e", padx=6, pady=14)
        win.transient(self.root); win.grab_set(); self.root.wait_window(win)
        return result["product"]

    def add_product(self):
        p = self.product_form()
        if not p: return
        if any(x.id == p.id for x in self.products):
            messagebox.showerror("Duplicate", "A product with this ID already exists")
            return
        self.products.append(p); save_products(self.products); self.refresh_filters(); self.apply_filters()

    def edit_selected(self):
        if not self.selected: return
        old_id = self.selected.id
        p = self.product_form(self.selected)
        if not p: return
        self.products = [p if x.id == old_id else x for x in self.products]
        self.selected = p; save_products(self.products); self.refresh_filters(); self.apply_filters(); self.show_details()

    def bulk_edit_category(self):
        selected_ids = set(self.tree.selection())
        cats = sorted({p.category for p in self.products if p.category})
        if not cats and not selected_ids:
            messagebox.showwarning("No products", "No products available.")
            return

        win = tk.Toplevel(self.root); win.title("Batch Edit"); win.geometry("560x520")
        fields = {}
        row = 0

        mode_var = tk.StringVar(value="selected" if selected_ids else "category")
        ttk.Label(win, text="Apply to:", font=("TkDefaultFont", 10, "bold")).grid(row=row, column=0, sticky="w", padx=8, pady=6); row += 1
        ttk.Radiobutton(win, text=f"Selected products ({len(selected_ids)})", variable=mode_var, value="selected").grid(row=row, column=0, columnspan=3, sticky="w", padx=8); row += 1
        ttk.Radiobutton(win, text="Entire category", variable=mode_var, value="category").grid(row=row, column=0, columnspan=3, sticky="w", padx=8); row += 1

        ttk.Label(win, text="Category").grid(row=row, column=0, sticky="w", padx=8, pady=6)
        cat_var = tk.StringVar(value=cats[0] if cats else "")
        cat_combo = ttk.Combobox(win, textvariable=cat_var, state="readonly", values=cats, width=32)
        cat_combo.grid(row=row, column=1, padx=8, pady=6); row += 1

        checks = {}
        def add_bulk_field(key, label, widget="entry", values=None):
            nonlocal row
            var = tk.BooleanVar(value=False)
            ttk.Checkbutton(win, variable=var).grid(row=row, column=0, sticky="e", padx=4)
            ttk.Label(win, text=label).grid(row=row, column=1, sticky="w", padx=4, pady=5)
            if widget == "combo":
                w = ttk.Combobox(win, values=values or [], state="readonly", width=28); w.set(values[0] if values else "")
            elif widget == "check":
                b = tk.BooleanVar(value=False); w = ttk.Checkbutton(win, variable=b); w.boolvar = b
            else:
                w = ttk.Entry(win, width=30)
            w.grid(row=row, column=2, sticky="w", padx=4, pady=5)
            checks[key] = (var, w)
            row += 1

        add_bulk_field("printer_type", "Printer Type", "combo", PRINTER_TYPES)
        add_bulk_field("press_temperature_celsius", "Press Temperature Celsius")
        add_bulk_field("press_time_seconds", "Press Time Seconds")
        add_bulk_field("press_enabled", "Requires Press", "check")
        add_bulk_field("bleed_cm", "Bleed cm", "entry")

        ttk.Label(win, text="Press Notes").grid(row=row, column=1, sticky="nw", padx=4, pady=5)
        notes_enable = tk.BooleanVar(value=False)
        ttk.Checkbutton(win, variable=notes_enable).grid(row=row, column=0, sticky="e")
        notes = tk.Text(win, width=30, height=5); notes.grid(row=row, column=2, padx=4, pady=5); row += 1

        def apply():
            if mode_var.get() == "selected":
                targets = [p for p in self.products if p.id in selected_ids]
            else:
                cat = cat_var.get()
                targets = [p for p in self.products if p.category == cat]
            if not targets:
                messagebox.showwarning("No targets", "No products matched.")
                return
            if not messagebox.askyesno("Confirm Batch Edit", f"Apply changes to {len(targets)} products?"):
                return
            for p in targets:
                p.production = dict(DEFAULT_PRODUCTION) | (p.production or {})
                for key, (enabled, widget) in checks.items():
                    if not enabled.get():
                        continue
                    if key == "press_enabled":
                        p.production[key] = bool(widget.boolvar.get())
                    elif key == "bleed_cm":
                        try:
                            p.bleed_cm = float(widget.get() or 0.2)
                        except Exception:
                            pass
                    else:
                        p.production[key] = widget.get().strip()
                if notes_enable.get():
                    p.production["press_notes"] = notes.get("1.0", "end").strip()
            save_products(self.products); self.refresh_filters(); self.apply_filters(); win.destroy()
            messagebox.showinfo("Batch Edit", f"Updated {len(targets)} products.")

        ttk.Button(win, text="Apply Batch Edit", command=apply).grid(row=row, column=2, sticky="e", padx=8, pady=12)
        win.transient(self.root); win.grab_set()

    def duplicate_selected(self):
        if not self.selected: return
        p = Product.from_dict(self.selected.to_dict()); p.id = p.id + "_copy"; p.name = p.name + " copy"
        self.products.append(p); save_products(self.products); self.refresh_filters(); self.apply_filters()

    def delete_selected(self):
        if not self.selected: return
        if messagebox.askyesno("Delete", f"Delete {self.selected.name}?"):
            self.products = [p for p in self.products if p.id != self.selected.id]
            self.selected = None; save_products(self.products); self.refresh_filters(); self.apply_filters()
            self.detail_img.config(image="", text="No image"); self.mask_preview.config(image="", text="No mask"); self.clear_details_frame()

    def attach_mask(self):
        if not self.selected: return
        path = filedialog.askopenfilename(filetypes=[("Mask files", "*.png *.jpg *.jpeg *.svg"), ("All files", "*.*")])
        if not path: return
        rel = copy_mask_to_library(path, self.selected.id); full = ROOT / rel
        if Path(path).suffix.lower() in (".jpg", ".jpeg", ".png"):
            if messagebox.askyesno("White background", "Remove white background and save as transparent PNG?"):
                png_rel = f"masks/{slugify(self.selected.id)}.png"
                remove_white_background(str(full), str(ROOT / png_rel)); rel = png_rel
        self.selected.mask_path = rel; save_products(self.products); self.apply_filters(); self.show_details()

    def remove_mask(self):
        if not self.selected: return
        if not self.selected.mask_path:
            messagebox.showinfo("No mask", "This product has no mask attached."); return
        if messagebox.askyesno("Remove mask", f"Remove mask from {self.selected.name}?\nThe file will stay in the masks folder."):
            self.selected.mask_path = ""; save_products(self.products); self.apply_filters(); self.show_details()

    def export_selected(self):
        if not self.selected:
            messagebox.showwarning("No product", "Select a product first"); return
        if self.selected.width_cm <= 0 or self.selected.height_cm <= 0:
            messagebox.showerror("Invalid size", "Selected product has invalid dimensions."); return
        out = export_selected_product(self.selected)
        messagebox.showinfo("Exported", f"Exported for SPP:\n{out}")

def main():
    root = tk.Tk()
    ProductLibraryApp(root)
    root.mainloop()
