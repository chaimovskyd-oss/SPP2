import { ArrowLeft, Boxes, LayoutGrid, RefreshCw, Search, Tag } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { isProductBridgeAvailable, loadProductLibrary } from "@/services/python_bridge/productBridge";
import type { ProductDefinition } from "@/types/product";

interface ProductLibraryScreenProps {
  onOpenStandard: (product: ProductDefinition) => void;
  onOpenCollage: (product: ProductDefinition) => void;
  onCancel: () => void;
}

export function ProductLibraryScreen({
  onOpenStandard,
  onOpenCollage,
  onCancel
}: ProductLibraryScreenProps): ReactElement {
  const [products, setProducts] = useState<ProductDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductDefinition | null>(null);

  useEffect(() => {
    void loadLibrary();
  }, []);

  async function loadLibrary(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      if (!isProductBridgeAvailable()) {
        setError("ספריית המוצרים אינה זמינה כרגע (נדרש חיבור לשרת Python).");
        return;
      }
      const defs = await loadProductLibrary();
      setProducts(defs.filter((p) => p.metadata.active !== false));
    } catch (err) {
      setError(`שגיאה בטעינת ספריית המוצרים: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of products) cats.add(p.category);
    return ["all", ...Array.from(cats).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [products, query, selectedCategory]);

  function formatSize(def: ProductDefinition): string {
    const w = (def.canvasSize.width / 10).toFixed(1);
    const h = (def.canvasSize.height / 10).toFixed(1);
    return `${w} × ${h} ס"מ`;
  }

  return (
    <div className="product-lib-screen">
      {/* ── Header ── */}
      <header className="product-lib-header">
        <button className="btn btn-ghost" onClick={onCancel} type="button">
          <ArrowLeft size={16} />
          חזרה
        </button>
        <h1>
          <Boxes size={20} />
          ספריית מוצרים
        </h1>
        <button className="btn btn-ghost" onClick={() => void loadLibrary()} title="רענן" type="button">
          <RefreshCw size={15} />
        </button>
      </header>

      <div className="product-lib-body">
        {/* ── Sidebar ── */}
        <aside className="product-lib-sidebar">
          <label className="product-lib-search">
            <Search size={14} />
            <input
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש מוצר..."
              type="search"
              value={query}
            />
          </label>

          <div className="product-lib-categories">
            <span className="product-lib-cat-label">
              <Tag size={12} />
              קטגוריות
            </span>
            {categories.map((cat) => (
              <button
                className={`product-lib-cat-btn${selectedCategory === cat ? " active" : ""}`}
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                type="button"
              >
                {cat === "all" ? "הכל" : cat}
              </button>
            ))}
          </div>
        </aside>

        {/* ── Main grid ── */}
        <main className="product-lib-main">
          {loading && (
            <div className="product-lib-empty">
              <div className="pp-spinner" />
              <span>טוען מוצרים...</span>
            </div>
          )}
          {!loading && error && (
            <div className="product-lib-empty product-lib-error">
              <span>{error}</span>
              <button className="btn btn-ghost" onClick={() => void loadLibrary()} type="button">
                <RefreshCw size={14} />
                נסה שוב
              </button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="product-lib-empty">
              <Boxes size={36} />
              <span>לא נמצאו מוצרים</span>
            </div>
          )}
          {!loading && !error && (
            <div className="product-lib-grid">
              {filtered.map((product) => (
                <button
                  className={`product-lib-card${selectedProduct?.id === product.id ? " selected" : ""}`}
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  onDoubleClick={() => onOpenStandard(product)}
                  type="button"
                >
                  <span className="product-lib-card-thumb">
                    {product.metadata.imageUrl ? (
                      <img
                        alt=""
                        src={String(product.metadata.imageUrl)}
                      />
                    ) : (
                      <Boxes size={28} />
                    )}
                  </span>
                  <span className="product-lib-card-info">
                    <strong>{product.name}</strong>
                    <span className="product-lib-card-cat">{product.category}</span>
                    <span className="product-lib-card-size">{formatSize(product)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Footer actions ── */}
      {selectedProduct && (
        <footer className="product-lib-footer">
          <div className="product-lib-footer-info">
            <strong>{selectedProduct.name}</strong>
            <span>{formatSize(selectedProduct)}</span>
            {selectedProduct.productionType && (
              <span className="product-lib-badge">{selectedProduct.productionType}</span>
            )}
          </div>
          <div className="product-lib-footer-actions">
            <button
              className="btn btn-ghost"
              onClick={() => onOpenCollage(selectedProduct)}
              type="button"
            >
              <LayoutGrid size={15} />
              פתח כקולאז&apos;
            </button>
            <button
              className="btn btn-accent"
              onClick={() => onOpenStandard(selectedProduct)}
              type="button"
            >
              <ArrowLeft size={15} />
              פתח לעיצוב
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
