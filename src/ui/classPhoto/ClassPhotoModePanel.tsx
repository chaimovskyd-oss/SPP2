import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Trash2,
  Type,
  UserRound,
  Users,
  X
} from "lucide-react";
import type { ShadowStyle, StrokeStyle } from "@/types/primitives";
import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement
} from "react";
import { importImageAsset } from "@/core/assets/assetManager";
import { createClassPhotoPersonRecord } from "@/core/classPhoto/classPhotoFactory";
import { useDocumentStore } from "@/state/documentStore";
import type { ClassPhotoLayoutRule, ClassPhotoPersonRecord } from "@/types/classPhoto";
import type { VisualLayer, TextLayer } from "@/types/layers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CPTextRole = "childName" | "staffName" | "title" | "footer" | null;

function detectCPTextRole(layer: VisualLayer | null, rule: ClassPhotoLayoutRule): CPTextRole {
  if (!layer || layer.type !== "text") return null;
  const nameMeta = layer.metadata?.["classPhotoName"] as { role?: string } | undefined;
  if (nameMeta) return nameMeta.role === "staff" ? "staffName" : "childName";
  if (layer.metadata?.["classPhotoTitle"]) return "title";
  if (layer.metadata?.["classPhotoFooter"]) return "footer";
  return null;
}

interface ClassPhotoModePanelProps {
  rule: ClassPhotoLayoutRule;
  selectedLayer: VisualLayer | null;
  onBackToWizard: () => void;
}

export function ClassPhotoModePanel({ rule, selectedLayer, onBackToWizard }: ClassPhotoModePanelProps): ReactElement {
  const [addRole, setAddRole] = useState<"child" | "staff">("child");
  const [overflowWarning] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const addFileInputRef = useRef<HTMLInputElement>(null);

  const activePageId = useDocumentStore((s) => s.activePageId);
  const regenerateClassPhoto = useDocumentStore((s) => s.regenerateClassPhoto);
  const addPeopleToClassPhoto = useDocumentStore((s) => s.addPeopleToClassPhoto);
  const removePersonFromClassPhoto = useDocumentStore((s) => s.removePersonFromClassPhoto);
  const updateClassPhotoPerson = useDocumentStore((s) => s.updateClassPhotoPerson);
  const updateClassPhotoFrameStyle = useDocumentStore((s) => s.updateClassPhotoFrameStyle);
  const updateClassPhotoNameTextStyle = useDocumentStore((s) => s.updateClassPhotoNameTextStyle);
  const applyClassPhotoTextStyleToGroup = useDocumentStore((s) => s.applyClassPhotoTextStyleToGroup);

  // Detect if selected layer is a managed class photo item
  const selectedPersonId =
    (selectedLayer?.metadata?.["classPhotoFrame"] as { personId?: string } | undefined)?.personId ??
    (selectedLayer?.metadata?.["classPhotoName"] as { personId?: string } | undefined)?.personId ??
    null;

  const selectedPerson = selectedPersonId
    ? rule.personRecords.find((r) => r.id === selectedPersonId) ?? null
    : null;

  const selectedCPTextRole = detectCPTextRole(selectedLayer, rule);

  async function handleAddFiles(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = "";

    const imported: import("@/types/document").Asset[] = [];
    const newRecords: ClassPhotoPersonRecord[] = [];
    const maxOrder = rule.personRecords.reduce((m, r) => Math.max(m, r.orderIndex), -1);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      try {
        const { asset } = await importImageAsset(file, [], { createPreview: true });
        imported.push(asset);
        newRecords.push(createClassPhotoPersonRecord(asset.id, file.name, addRole, maxOrder + 1 + i));
      } catch {
        // skip failed imports silently
      }
    }

    if (newRecords.length > 0) {
      addPeopleToClassPhoto(rule.id, newRecords, imported);
    }
  }

  function toggleSection(key: string): void {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const staffRecords = rule.personRecords.filter((r) => r.role === "staff");
  const childRecords = rule.personRecords.filter((r) => r.role === "child");

  return (
    <div className="cp-mode-panel" dir="rtl">
      {/* ── Overflow warning ── */}
      {overflowWarning && (
        <div className="cp-overflow-warning">
          <AlertTriangle size={14} />
          <span>התוכן חורג מגבולות הדף. הקטן מסגרות או ריווח.</span>
        </div>
      )}

      {/* ── Back to wizard ── */}
      <button className="cp-panel-btn cp-back-btn" onClick={onBackToWizard} type="button">
        <Settings size={14} />
        חזרה לאשף
      </button>

      {/* ── Add people ── */}
      <div className="cp-panel-section">
        <div className="cp-section-header" onClick={() => toggleSection("add")}>
          <span><Plus size={13} /> הוספת אנשים</span>
          {collapsed["add"] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed["add"] && (
          <div className="cp-section-body">
            <div className="cp-add-role-row">
              <button
                className={`cp-role-btn${addRole === "child" ? " active" : ""}`}
                onClick={() => setAddRole("child")}
                type="button"
              >
                <UserRound size={14} /> תלמידים
              </button>
              <button
                className={`cp-role-btn${addRole === "staff" ? " active" : ""}`}
                onClick={() => setAddRole("staff")}
                type="button"
              >
                <Users size={14} /> צוות
              </button>
            </div>
            <button
              className="cp-panel-btn cp-add-btn"
              onClick={() => addFileInputRef.current?.click()}
              type="button"
            >
              <UserRound size={16} />
              הוסף תמונות לתמונת מחזור
            </button>
            <input
              accept="image/*"
              hidden
              multiple
              onChange={(e) => void handleAddFiles(e)}
              ref={addFileInputRef}
              type="file"
            />
            <div className="cp-count-row">
              <span>תלמידים: <strong>{childRecords.length}</strong></span>
              <span>צוות: <strong>{staffRecords.length}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* ── Selected person controls ── */}
      {selectedPerson && (
        <div className="cp-panel-section cp-selected-person">
          <div className="cp-section-header">
            <span><UserRound size={13} /> {selectedPerson.displayName}</span>
            <span className="cp-managed-badge">מנוהל</span>
          </div>
          <div className="cp-section-body">
            <label className="cp-field">
              <span>שם</span>
              <input
                dir="rtl"
                onChange={(e) =>
                  updateClassPhotoPerson(rule.id, selectedPerson.id, { displayName: e.target.value })
                }
                type="text"
                value={selectedPerson.displayName}
              />
            </label>
            <label className="cp-field">
              <span>תפקיד</span>
              <select
                onChange={(e) =>
                  updateClassPhotoPerson(rule.id, selectedPerson.id, { role: e.target.value as "child" | "staff" })
                }
                value={selectedPerson.role}
              >
                <option value="child">תלמיד</option>
                <option value="staff">צוות</option>
              </select>
            </label>
            <button
              className="cp-panel-btn cp-danger-btn"
              onClick={() => removePersonFromClassPhoto(rule.id, selectedPerson.id)}
              type="button"
            >
              <Trash2 size={13} /> הסר מהפריסה
            </button>
          </div>
        </div>
      )}

      {/* ── Apply text style to group ── */}
      {selectedCPTextRole !== null && selectedLayer && activePageId && (
        <div className="cp-panel-section cp-selected-person">
          <div className="cp-section-header">
            <span><Type size={13} /> החל סגנון טקסט</span>
            <span className="cp-managed-badge">
              {selectedCPTextRole === "childName" ? "שם ילד"
                : selectedCPTextRole === "staffName" ? "שם צוות"
                : selectedCPTextRole === "title" ? "כותרת"
                : "תחתית"}
            </span>
          </div>
          <div className="cp-section-body">
            <p className="cp-apply-hint">
              החל גופן, גודל וצבע של שכבה זו על:
            </p>
            <div className="cp-apply-btn-group">
              {(selectedCPTextRole === "childName" || selectedCPTextRole === "staffName") && (
                <>
                  <button
                    className="cp-apply-btn"
                    onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "child")}
                    type="button"
                  >
                    כל שמות הילדים
                  </button>
                  <button
                    className="cp-apply-btn"
                    onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "staff")}
                    type="button"
                  >
                    כל שמות הצוות
                  </button>
                  <button
                    className="cp-apply-btn"
                    onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "all_names")}
                    type="button"
                  >
                    כל השמות
                  </button>
                </>
              )}
              {(selectedCPTextRole === "title" || selectedCPTextRole === "footer") && (
                <>
                  <button
                    className="cp-apply-btn"
                    onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "title")}
                    type="button"
                  >
                    כותרת עליונה
                  </button>
                  <button
                    className="cp-apply-btn"
                    onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "footer")}
                    type="button"
                  >
                    כותרת תחתונה
                  </button>
                </>
              )}
              <button
                className="cp-apply-btn cp-apply-btn-all"
                onClick={() => applyClassPhotoTextStyleToGroup(rule.id, selectedLayer.id, activePageId, "all")}
                type="button"
              >
                כל הטקסטים
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Frame style ── */}
      <div className="cp-panel-section">
        <div className="cp-section-header" onClick={() => toggleSection("frameStyle")}>
          <span><Palette size={13} /> סגנון מסגרות</span>
          {collapsed["frameStyle"] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed["frameStyle"] && (
          <div className="cp-section-body">
            <div className="cp-frame-style-label">תלמידים</div>
            <MiniShapePicker
              value={rule.childFrameStyle.shape}
              onChange={(shape) =>
                updateClassPhotoFrameStyle(rule.id, "child", { ...rule.childFrameStyle, shape })
              }
            />
            <MiniEffectRow
              label="צל תלמידים"
              shadow={rule.childFrameStyle.shadow}
              stroke={rule.childFrameStyle.stroke}
              onShadowChange={(shadow) =>
                updateClassPhotoFrameStyle(rule.id, "child", { ...rule.childFrameStyle, shadow })
              }
              onStrokeChange={(stroke) =>
                updateClassPhotoFrameStyle(rule.id, "child", { ...rule.childFrameStyle, stroke })
              }
            />
            <div className="cp-frame-style-label" style={{ marginTop: 10 }}>צוות</div>
            <MiniShapePicker
              value={rule.staffFrameStyle.shape}
              onChange={(shape) =>
                updateClassPhotoFrameStyle(rule.id, "staff", { ...rule.staffFrameStyle, shape })
              }
            />
            <MiniEffectRow
              label="צל צוות"
              shadow={rule.staffFrameStyle.shadow}
              stroke={rule.staffFrameStyle.stroke}
              onShadowChange={(shadow) =>
                updateClassPhotoFrameStyle(rule.id, "staff", { ...rule.staffFrameStyle, shadow })
              }
              onStrokeChange={(stroke) =>
                updateClassPhotoFrameStyle(rule.id, "staff", { ...rule.staffFrameStyle, stroke })
              }
            />
          </div>
        )}
      </div>

      {/* ── Name text style ── */}
      <div className="cp-panel-section">
        <div className="cp-section-header" onClick={() => toggleSection("nameStyle")}>
          <span><Type size={13} /> סגנון שמות</span>
          {collapsed["nameStyle"] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed["nameStyle"] && (
          <div className="cp-section-body">
            <div className="cp-frame-style-label">שמות תלמידים</div>
            <MiniTextStylePicker
              color={rule.childNameTextStyle.color}
              fontSize={rule.childNameTextStyle.fontSize}
              fontWeight={rule.childNameTextStyle.fontWeight}
              onColorChange={(color) => updateClassPhotoNameTextStyle(rule.id, "child", { color })}
              onFontSizeChange={(fontSize) => updateClassPhotoNameTextStyle(rule.id, "child", { fontSize })}
              onFontWeightChange={(fontWeight) => updateClassPhotoNameTextStyle(rule.id, "child", { fontWeight })}
            />
            <div className="cp-frame-style-label" style={{ marginTop: 10 }}>שמות צוות</div>
            <MiniTextStylePicker
              color={rule.staffNameTextStyle.color}
              fontSize={rule.staffNameTextStyle.fontSize}
              fontWeight={rule.staffNameTextStyle.fontWeight}
              onColorChange={(color) => updateClassPhotoNameTextStyle(rule.id, "staff", { color })}
              onFontSizeChange={(fontSize) => updateClassPhotoNameTextStyle(rule.id, "staff", { fontSize })}
              onFontWeightChange={(fontWeight) => updateClassPhotoNameTextStyle(rule.id, "staff", { fontWeight })}
            />
          </div>
        )}
      </div>

      {/* ── Regenerate ── */}
      <div className="cp-panel-section">
        <button
          className="cp-panel-btn cp-regen-btn"
          onClick={() => regenerateClassPhoto(rule.id)}
          type="button"
        >
          <RotateCcw size={13} /> צור פריסה מחדש
        </button>
      </div>

      {/* ── People list ── */}
      <div className="cp-panel-section">
        <div className="cp-section-header" onClick={() => toggleSection("people")}>
          <span><Users size={13} /> רשימת אנשים ({rule.personRecords.length})</span>
          {collapsed["people"] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
        {!collapsed["people"] && (
          <div className="cp-section-body cp-people-scroll">
            {staffRecords.length > 0 && (
              <>
                <div className="cp-group-label">צוות ({staffRecords.length})</div>
                {staffRecords.map((rec) => (
                  <PersonRowItem
                    key={rec.id}
                    record={rec}
                    ruleId={rule.id}
                    onRemove={() => removePersonFromClassPhoto(rule.id, rec.id)}
                    onNameChange={(name) => updateClassPhotoPerson(rule.id, rec.id, { displayName: name })}
                    onRoleChange={(role) => updateClassPhotoPerson(rule.id, rec.id, { role })}
                  />
                ))}
              </>
            )}
            {childRecords.length > 0 && (
              <>
                <div className="cp-group-label">תלמידים ({childRecords.length})</div>
                {childRecords.map((rec) => (
                  <PersonRowItem
                    key={rec.id}
                    record={rec}
                    ruleId={rule.id}
                    onRemove={() => removePersonFromClassPhoto(rule.id, rec.id)}
                    onNameChange={(name) => updateClassPhotoPerson(rule.id, rec.id, { displayName: name })}
                    onRoleChange={(role) => updateClassPhotoPerson(rule.id, rec.id, { role })}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const MINI_SHAPES: Array<{ value: import("@/types/classPhoto").ClassPhotoFrameStyle["shape"]; label: string }> = [
  { value: "circle", label: "עיגול" },
  { value: "roundedRect", label: "מעוגל" },
  { value: "rect", label: "מלבן" },
  { value: "ellipse", label: "אליפסה" },
  { value: "star", label: "כוכב" },
  { value: "cloud", label: "ענן" }
];

function MiniShapePicker({ value, onChange }: {
  value: import("@/types/classPhoto").ClassPhotoFrameStyle["shape"];
  onChange: (s: import("@/types/classPhoto").ClassPhotoFrameStyle["shape"]) => void;
}): ReactElement {
  return (
    <div className="cp-mini-shape-row">
      {MINI_SHAPES.map((opt) => (
        <button
          className={`cp-mini-shape-btn${value === opt.value ? " active" : ""}`}
          key={opt.value}
          onClick={() => onChange(opt.value)}
          title={opt.label}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MiniTextStylePicker({ fontSize, fontWeight, color, onFontSizeChange, onFontWeightChange, onColorChange }: {
  fontSize: number; onFontSizeChange: (v: number) => void;
  fontWeight: number; onFontWeightChange: (v: number) => void;
  color: string; onColorChange: (v: string) => void;
}): ReactElement {
  return (
    <div className="cp-text-style-row">
      <label className="cp-mini-field">
        <span>גודל</span>
        <input
          dir="ltr"
          max={72}
          min={8}
          onChange={(e) => onFontSizeChange(Number(e.target.value))}
          type="number"
          value={fontSize}
        />
      </label>
      <label className="cp-mini-field">
        <span>עובי</span>
        <select onChange={(e) => onFontWeightChange(Number(e.target.value))} value={fontWeight}>
          <option value={300}>רזה</option>
          <option value={400}>רגיל</option>
          <option value={600}>בינוני</option>
          <option value={700}>מודגש</option>
        </select>
      </label>
      <label className="cp-mini-field">
        <span>צבע</span>
        <input
          dir="ltr"
          onChange={(e) => onColorChange(e.target.value)}
          type="color"
          value={color}
        />
      </label>
    </div>
  );
}

function MiniEffectRow({ shadow, stroke, onShadowChange, onStrokeChange }: {
  label?: string;
  shadow: ShadowStyle | undefined;
  stroke: StrokeStyle | undefined;
  onShadowChange: (s: ShadowStyle | undefined) => void;
  onStrokeChange: (s: StrokeStyle | undefined) => void;
}): ReactElement {
  return (
    <div className="cp-mini-effect-row">
      <label className="cp-toggle-row" style={{ fontSize: "0.76rem" }}>
        <input
          checked={shadow !== undefined}
          onChange={() => onShadowChange(
            shadow ? undefined : { version: 1, color: "#000000", blur: 18, offsetX: 0, offsetY: 6, opacity: 0.28 }
          )}
          type="checkbox"
        />
        <span>צל</span>
        {shadow && (
          <>
            <input type="color" value={shadow.color} onChange={(e) => onShadowChange({ ...shadow, color: e.target.value })} style={{ width: 24, height: 20, padding: 1, border: "none", borderRadius: 4, cursor: "pointer" }} />
            <input dir="ltr" type="range" min={0} max={50} value={shadow.blur} onChange={(e) => onShadowChange({ ...shadow, blur: Number(e.target.value) })} style={{ width: 50 }} title="טשטוש" />
          </>
        )}
      </label>
      <label className="cp-toggle-row" style={{ fontSize: "0.76rem" }}>
        <input
          checked={stroke !== undefined}
          onChange={() => onStrokeChange(
            stroke ? undefined : { version: 1, color: "#ffffff", width: 4, opacity: 1 }
          )}
          type="checkbox"
        />
        <span>מסגרת</span>
        {stroke && (
          <>
            <input type="color" value={stroke.color} onChange={(e) => onStrokeChange({ ...stroke, color: e.target.value })} style={{ width: 24, height: 20, padding: 1, border: "none", borderRadius: 4, cursor: "pointer" }} />
            <input dir="ltr" type="range" min={1} max={20} value={stroke.width} onChange={(e) => onStrokeChange({ ...stroke, width: Number(e.target.value) })} style={{ width: 50 }} title="עובי" />
          </>
        )}
      </label>
    </div>
  );
}

function PersonRowItem({ record, ruleId, onRemove, onNameChange, onRoleChange }: {
  record: ClassPhotoPersonRecord;
  ruleId: string;
  onRemove: () => void;
  onNameChange: (name: string) => void;
  onRoleChange: (role: "child" | "staff") => void;
}): ReactElement {
  return (
    <div className="cp-person-item">
      <UserRound className="cp-person-icon" size={14} />
      <input
        className="cp-person-name-input"
        dir="rtl"
        onChange={(e) => onNameChange(e.target.value)}
        type="text"
        value={record.displayName}
      />
      <select
        className="cp-person-role-select"
        onChange={(e) => onRoleChange(e.target.value as "child" | "staff")}
        value={record.role}
      >
        <option value="child">תלמיד</option>
        <option value="staff">צוות</option>
      </select>
      <button className="cp-person-del" onClick={onRemove} title="הסר" type="button">
        <X size={11} />
      </button>
    </div>
  );
}
