from __future__ import annotations
import json
import os
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image, ImageTk, ImageOps

from core.product_library import ProductLibrary
from core.scoring import rank_products

APP_DIR = Path(__file__).resolve().parent
PRODUCT_LIBRARY_DIR = APP_DIR / "product_library"
EXPORT_DIR = APP_DIR / "exports"
EXPORT_DIR.mkdir(exist_ok=True)


class ProductMatchEngineV4(tk.Tk):
    def __init__(self, on_product_selected=None):
        super().__init__()
        self.title("Product Match Engine V4 - synced with Product Library")
        self.geometry("1320x820")
        self.minsize(1100, 700)
        self.on_product_selected = on_product_selected

        self.library = ProductLibrary(str(PRODUCT_LIBRARY_DIR))
        self.image_path: Optional[str] = None
        self.image_obj: Optional[Image.Image] = None
        self.results: list[Dict[str, Any]] = []
        self.filtered_results: list[Dict[str, Any]] = []
        self.selected_result: Optional[Dict[str, Any]] = None
        self.tree_image_refs: dict[str, ImageTk.PhotoImage] = {}

        self._setup_style()
        self._build_ui()
        self.refresh_products(run_match=False)

    def _setup_style(self):
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("Treeview", rowheight=84, font=("Segoe UI", 10))
        style.configure("Treeview.Heading", font=("Segoe UI", 10, "bold"))
        style.configure("Big.TButton", padding=(10, 8), font=("Segoe UI", 10, "bold"))

    def _build_ui(self):
        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")
        ttk.Button(top, text="Load Customer Image", style="Big.TButton", command=self.load_image).pack(side="left", padx=4)
        ttk.Button(top, text="Refresh Products", command=lambda: self.refresh_products(run_match=True)).pack(side="left", padx=4)
        ttk.Button(top, text="Open Product Library Folder", command=lambda: self.open_folder(PRODUCT_LIBRARY_DIR)).pack(side="left", padx=4)
        ttk.Button(top, text="Export Recommendation JSON", command=self.export_recommendation_json).pack(side="left", padx=4)
        ttk.Button(top, text="Open Recommended Product", style="Big.TButton", command=self.open_selected_product).pack(side="right", padx=4)

        filters = ttk.LabelFrame(self, text="Search & Filters", padding=8)
        filters.pack(fill="x", padx=8, pady=4)

        ttk.Label(filters, text="Search").pack(side="left")
        self.search_var = tk.StringVar()
        search = ttk.Entry(filters, textvariable=self.search_var, width=26)
        search.pack(side="left", padx=6)
        search.bind("<KeyRelease>", lambda e: self.apply_filters())

        self.category_var = tk.StringVar(value="All")
        self.audience_var = tk.StringVar(value="All")
        self.material_var = tk.StringVar(value="All")
        self.mask_var = tk.StringVar(value="All")
        self.max_price_var = tk.StringVar()

        self.category_combo = self._combo(filters, "Category", self.category_var)
        self.audience_combo = self._combo(filters, "Audience", self.audience_var)
        self.material_combo = self._combo(filters, "Material", self.material_var)

        ttk.Label(filters, text="Max Price").pack(side="left", padx=(12, 0))
        ttk.Entry(filters, textvariable=self.max_price_var, width=8).pack(side="left", padx=6)
        ttk.Label(filters, text="Mask").pack(side="left", padx=(12, 0))
        self.mask_combo = ttk.Combobox(filters, textvariable=self.mask_var, values=["All", "With mask", "Without mask"], width=14, state="readonly")
        self.mask_combo.pack(side="left", padx=6)
        self.mask_combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())
        ttk.Button(filters, text="Apply", command=self.apply_filters).pack(side="left", padx=4)
        ttk.Button(filters, text="Reset", command=self.reset_filters).pack(side="left", padx=4)

        body = ttk.PanedWindow(self, orient="horizontal")
        body.pack(fill="both", expand=True, padx=8, pady=8)

        left = ttk.Frame(body, padding=6)
        body.add(left, weight=1)
        ttk.Label(left, text="Customer Image", font=("Segoe UI", 12, "bold")).pack(anchor="w")
        self.image_label = ttk.Label(left, text="Load an image to start matching", anchor="center", relief="groove")
        self.image_label.pack(fill="both", expand=True, pady=6)
        self.image_info_label = ttk.Label(left, text="No image loaded", wraplength=280, justify="left")
        self.image_info_label.pack(fill="x")

        mid = ttk.Frame(body, padding=6)
        body.add(mid, weight=3)
        ttk.Label(mid, text="Recommended Products", font=("Segoe UI", 12, "bold")).pack(anchor="w")
        table_frame = ttk.Frame(mid)
        table_frame.pack(fill="both", expand=True, pady=6)

        cols = ("score", "name", "price", "category", "size", "mask", "reason")
        self.tree = ttk.Treeview(table_frame, columns=cols, show="tree headings", selectmode="browse")
        self.tree.heading("#0", text="Image")
        self.tree.column("#0", width=92, minwidth=88, anchor="center", stretch=False)
        headings = {
            "score": "Score", "name": "Product", "price": "Price", "category": "Category",
            "size": "Size", "mask": "Mask", "reason": "Reason"
        }
        widths = {"score": 70, "name": 240, "price": 70, "category": 160, "size": 100, "mask": 75, "reason": 280}
        for c in cols:
            self.tree.heading(c, text=headings[c])
            self.tree.column(c, width=widths[c], anchor="w")

        yscroll = tk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview, width=24)
        xscroll = tk.Scrollbar(table_frame, orient="horizontal", command=self.tree.xview, width=18)
        self.tree.configure(yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        yscroll.grid(row=0, column=1, sticky="ns")
        xscroll.grid(row=1, column=0, sticky="ew")
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)
        self.tree.bind("<<TreeviewSelect>>", self.on_select)
        self.tree.bind("<Double-1>", lambda e: self.open_selected_product())
        self.tree.bind("<MouseWheel>", self._on_mousewheel)
        self.tree.bind("<Button-4>", self._on_mousewheel)
        self.tree.bind("<Button-5>", self._on_mousewheel)

        right = ttk.Frame(body, padding=6)
        body.add(right, weight=1)
        ttk.Label(right, text="Product Details", font=("Segoe UI", 12, "bold")).pack(anchor="w")
        self.details = tk.Text(right, height=13, wrap="word", font=("Segoe UI", 10))
        self.details.pack(fill="x", pady=6)
        ttk.Label(right, text="Product Thumbnail / Mask", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        self.detail_image_label = ttk.Label(right, text="No product selected", anchor="center", relief="groove")
        self.detail_image_label.pack(fill="both", expand=True, pady=6)
        self.mask_preview_label = ttk.Label(right, text="Mask preview will appear here", anchor="center", relief="groove")
        self.mask_preview_label.pack(fill="both", expand=True, pady=6)

    def _combo(self, parent, label, variable):
        ttk.Label(parent, text=label).pack(side="left", padx=(12, 0))
        combo = ttk.Combobox(parent, textvariable=variable, width=18, state="readonly")
        combo.pack(side="left", padx=6)
        combo.bind("<<ComboboxSelected>>", lambda e: self.apply_filters())
        return combo

    def _on_mousewheel(self, event):
        if getattr(event, "num", None) == 4:
            self.tree.yview_scroll(-3, "units")
        elif getattr(event, "num", None) == 5:
            self.tree.yview_scroll(3, "units")
        else:
            self.tree.yview_scroll(int(-1 * (event.delta / 120)) * 3, "units")
        return "break"

    def refresh_products(self, run_match=True):
        self.library.reload()
        self.category_combo["values"] = ["All"] + self.library.categories()
        self.audience_combo["values"] = ["All"] + self.library.audiences()
        self.material_combo["values"] = ["All"] + self.library.materials()
        if self.image_obj and run_match:
            self.run_match()
        else:
            self.results = [{"product": p, "score": 0.0, "reason": "Load image for score", "warnings": []} for p in self.library.products]
            self.apply_filters()

    def load_image(self):
        path = filedialog.askopenfilename(filetypes=[("Images", "*.jpg *.jpeg *.png *.webp *.bmp"), ("All files", "*.*")])
        if not path:
            return
        try:
            img = Image.open(path)
            img = ImageOps.exif_transpose(img).convert("RGB")
        except Exception as e:
            messagebox.showerror("Image error", f"Could not open image:\n{e}")
            return
        self.image_path = path
        self.image_obj = img
        thumb = img.copy()
        thumb.thumbnail((360, 560))
        self.tk_customer_image = ImageTk.PhotoImage(thumb)
        self.image_label.configure(image=self.tk_customer_image, text="")
        ratio = img.width / img.height if img.height else 0
        self.image_info_label.configure(text=f"{Path(path).name}\nPixels: {img.width} x {img.height}\nRatio: {ratio:.3f}")
        self.run_match()

    def run_match(self):
        if not self.image_obj:
            return
        self.results = rank_products(self.library.products, self.image_obj.width, self.image_obj.height)
        self.apply_filters()

    def reset_filters(self):
        self.search_var.set("")
        self.category_var.set("All")
        self.audience_var.set("All")
        self.material_var.set("All")
        self.mask_var.set("All")
        self.max_price_var.set("")
        self.apply_filters()

    def apply_filters(self):
        query = self.search_var.get().strip().lower()
        category = self.category_var.get()
        audience = self.audience_var.get()
        material = self.material_var.get()
        mask_filter = self.mask_var.get()
        max_price = None
        if self.max_price_var.get().strip():
            try:
                max_price = float(self.max_price_var.get().strip())
            except ValueError:
                return
        filtered = []
        for result in self.results:
            p = result["product"]
            haystack = " ".join(str(p.get(k, "")) for k in ["name", "category", "material", "orientation", "tips"]).lower()
            haystack += " " + " ".join(str(x) for x in (p.get("audience") or [])).lower()
            haystack += f" {p.get('width_cm')}x{p.get('height_cm')}"
            if query and query not in haystack:
                continue
            if category != "All" and p.get("category") != category:
                continue
            if audience != "All" and audience not in (p.get("audience") or []):
                continue
            if material != "All" and p.get("material") != material:
                continue
            if max_price is not None and float(p.get("price") or 0) > max_price:
                continue
            has_mask = bool(p.get("mask_path"))
            if mask_filter == "With mask" and not has_mask:
                continue
            if mask_filter == "Without mask" and has_mask:
                continue
            filtered.append(result)
        self.filtered_results = filtered
        self.render_tree()

    def _placeholder_image(self):
        img = Image.new("RGB", (72, 72), "#eeeeee")
        return ImageTk.PhotoImage(img)

    def render_tree(self):
        self.tree.delete(*self.tree.get_children())
        self.tree_image_refs.clear()
        limit = 500
        for idx, result in enumerate(self.filtered_results[:limit]):
            p = result["product"]
            iid = str(idx)
            image_obj = None
            thumb_path = self.library.ensure_thumbnail(p)
            if thumb_path and os.path.exists(thumb_path):
                try:
                    img = Image.open(thumb_path).convert("RGB")
                    img.thumbnail((72, 72))
                    image_obj = ImageTk.PhotoImage(img)
                except Exception:
                    image_obj = None
            if image_obj is None:
                image_obj = self._placeholder_image()
            self.tree_image_refs[iid] = image_obj
            warnings = result.get("warnings") or []
            reason = result.get("reason") or ("; ".join(warnings) if warnings else "")
            self.tree.insert(
                "", "end", iid=iid, text="", image=image_obj,
                values=(
                    f"{result.get('score', 0):.1f}%" if self.image_obj else "-",
                    p.get("name", ""),
                    f"₪{float(p.get('price') or 0):g}" if p.get("price") not in (None, "") else "",
                    p.get("category", ""),
                    f"{float(p.get('width_cm') or 0):g}×{float(p.get('height_cm') or 0):g}",
                    "Yes" if p.get("mask_path") else "No",
                    reason,
                )
            )

    def on_select(self, event=None):
        sel = self.tree.selection()
        if not sel:
            return
        idx = int(sel[0])
        if idx >= len(self.filtered_results):
            return
        self.selected_result = self.filtered_results[idx]
        p = self.selected_result["product"]
        warnings = self.selected_result.get("warnings") or []
        lines = [
            f"{p.get('name', '')}",
            f"Score: {self.selected_result.get('score', 0)}%",
            f"Size: {p.get('width_cm')} × {p.get('height_cm')} cm",
            f"Orientation: {p.get('orientation', 'any')}",
            f"Category: {p.get('category', '')}",
            f"Price: ₪{p.get('price', '')}",
            f"Material: {p.get('material', '')}",
            f"Fit mode: {self.selected_result.get('selected_fit_mode', 'full_area')}",
            f"Reason: {self.selected_result.get('reason', '')}",
            f"Aspect score: {self.selected_result.get('aspect_score', '-')}",
            f"DPI score: {self.selected_result.get('dpi_score', '-')} / Effective DPI: {self.selected_result.get('effective_dpi', '-')}",
        ]
        if warnings:
            lines += ["", "Warnings:"] + [f"- {w}" for w in warnings]
        if p.get("tips"):
            lines += ["", "Tips:", str(p.get("tips"))]
        self.details.delete("1.0", "end")
        self.details.insert("1.0", "\n".join(lines))
        self.update_detail_images(p)

    def update_detail_images(self, product: Dict[str, Any]):
        thumb_path = self.library.ensure_thumbnail(product, size=(240, 180))
        if thumb_path and os.path.exists(thumb_path):
            try:
                img = Image.open(thumb_path).convert("RGB")
                img.thumbnail((260, 190))
                self.tk_detail_thumb = ImageTk.PhotoImage(img)
                self.detail_image_label.configure(image=self.tk_detail_thumb, text="")
            except Exception:
                self.detail_image_label.configure(image="", text="No thumbnail")
        else:
            self.detail_image_label.configure(image="", text="No thumbnail")

        mask_path = self.library.resolve_mask_path(product)
        if mask_path and os.path.exists(mask_path):
            try:
                img = Image.open(mask_path)
                img = ImageOps.exif_transpose(img).convert("RGBA")
                img.thumbnail((260, 190))
                self.tk_mask_thumb = ImageTk.PhotoImage(img)
                self.mask_preview_label.configure(image=self.tk_mask_thumb, text="")
            except Exception:
                self.mask_preview_label.configure(image="", text="Mask exists but cannot preview")
        else:
            self.mask_preview_label.configure(image="", text="No mask assigned")

    def selected_contract(self) -> Optional[Dict[str, Any]]:
        if not self.selected_result:
            return None
        p = dict(self.selected_result["product"])
        try:
            width_cm = float(p.get("width_cm"))
            height_cm = float(p.get("height_cm"))
        except Exception:
            return None
        if width_cm <= 0 or height_cm <= 0:
            return None
        mask_path = self.library.resolve_mask_path(p)
        if mask_path and not os.path.exists(mask_path):
            mask_path = ""
        return {
            "source": "product_match_engine_v4",
            "product_id": p.get("id", ""),
            "name": p.get("name", ""),
            "category": p.get("category", ""),
            "price": p.get("price", 0),
            "material": p.get("material", ""),
            "tips": p.get("tips", ""),
            "width_cm": width_cm,
            "height_cm": height_cm,
            "orientation": p.get("orientation", "any"),
            "mask_path": mask_path,
            "image_url": p.get("image_url", ""),
            "mockup_image_url": p.get("mockup_image_url", ""),
            "match_score": self.selected_result.get("score", 0),
            "match_reason": self.selected_result.get("reason", ""),
            "match_warnings": self.selected_result.get("warnings", []),
            "selected_fit_mode": self.selected_result.get("selected_fit_mode", "full_area"),
            "customer_image_path": self.image_path or "",
        }

    def export_recommendation_json(self):
        contract = self.selected_contract()
        if not contract:
            messagebox.showwarning("No selection", "Select a valid product first.")
            return
        out = EXPORT_DIR / "selected_recommendation.json"
        with out.open("w", encoding="utf-8") as f:
            json.dump(contract, f, ensure_ascii=False, indent=2)
        messagebox.showinfo("Exported", f"Recommendation JSON exported:\n{out}")
        self.open_folder(EXPORT_DIR)

    def open_selected_product(self):
        contract = self.selected_contract()
        if not contract:
            messagebox.showwarning("No selection", "Select a valid product first.")
            return
        # In standalone mode: export JSON. In embedded mode: call SPP callback.
        out = EXPORT_DIR / "selected_product_for_spp.json"
        with out.open("w", encoding="utf-8") as f:
            json.dump(contract, f, ensure_ascii=False, indent=2)
        if self.on_product_selected:
            self.on_product_selected(contract)
        else:
            messagebox.showinfo(
                "Ready for SPP",
                "Selected product exported for SPP.\n\n"
                f"Canvas size: {contract['width_cm']} × {contract['height_cm']} cm\n"
                f"Mask: {'Yes' if contract.get('mask_path') else 'No'}\n\n"
                f"File: {out}"
            )
            self.open_folder(EXPORT_DIR)

    @staticmethod
    def open_folder(path):
        path = str(path)
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.run(["open", path], check=False)
            else:
                subprocess.run(["xdg-open", path], check=False)
        except Exception:
            pass


def main():
    app = ProductMatchEngineV4()
    app.mainloop()
