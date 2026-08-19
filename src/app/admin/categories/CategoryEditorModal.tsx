"use client";

/* ============================================================
   카테고리 추가·수정 창.

   여기서 바로잡은 것:
   · 필수 입력이던 'URL 슬러그' 칸을 없앴다. 한글 이름을 넣으면 공용 slugify 가
     item-1vuyo3h1r32sbi 같은 난수를 채워 넣었고, 그 값이 그대로 고객 주소가 됐다.
     이제 주소는 읽을 수 있는 값으로 자동으로 지어지고(category-address.ts),
     평소에는 '고급 설정' 접이 안에 숨어 있다.
   · 수정할 때 주소 칸은 잠겨 있다. 열려면 경고를 읽고 한 번 더 눌러야 한다 —
     주소를 바꾸는 순간 이미 뿌린 링크가 전부 전체 목록으로 떨어지기 때문이다.
   · 같은 이름의 카테고리가 있으면 타이핑 중에 알려 준다(DB 에 이름 unique 가 없다).
   ============================================================ */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Help, Input, Textarea, Toggle } from "@/components/admin/Field";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import CategoryImageField from "./CategoryImageField";
import {
  ADDRESS_RE,
  ADDRESS_RULE_MESSAGE,
  storePath,
  suggestAddress,
  toAddressForm,
} from "./category-address";
import {
  ADDRESS_CHANGE_WARNING,
  ADDRESS_USAGE_HELP,
  DESCRIPTION_USAGE_HELP,
  HOME_TILE_LIMIT,
  homeFallbackImage,
  type CategoryRow,
} from "./category-types";

export interface CategoryEditorModalProps {
  /** null 이면 새 카테고리 */
  row: CategoryRow | null;
  /** 목록 순서 그대로 — 이름·주소 중복 검사와 홈 자리 계산에 쓴다 (자기 자신 포함) */
  siblings: CategoryRow[];
  onClose: () => void;
  /** 저장 성공 — 목록에 띄울 안내 문구를 함께 넘긴다 */
  onSaved: (message: string) => void;
  onRequestDelete: (row: CategoryRow) => void;
}

const normalizeName = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();

export default function CategoryEditorModal({
  row,
  siblings,
  onClose,
  onSaved,
  onRequestDelete,
}: CategoryEditorModalProps) {
  const isNew = row === null;

  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(row?.image_url ?? null);
  const [isActive, setIsActive] = useState(row?.is_active ?? true);
  const [manualAddress, setManualAddress] = useState(row?.slug ?? "");
  /** 신규: 직접 정하기 체크 / 수정: 경고를 읽고 잠금을 푼 상태 */
  const [addressUnlocked, setAddressUnlocked] = useState(false);
  const [showAddressWarning, setShowAddressWarning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takenSlugs = useMemo(
    () => siblings.filter((s) => s.id !== row?.id).map((s) => s.slug),
    [siblings, row?.id]
  );

  // 자동 주소는 렌더 중에 계산한다 — effect 로 상태를 밀어 넣으면 타이핑과 어긋난다
  const autoAddress = useMemo(
    () => suggestAddress(name, takenSlugs, siblings.length + 1),
    [name, takenSlugs, siblings.length]
  );
  const address = addressUnlocked || !isNew ? manualAddress : autoAddress;

  const duplicateName = useMemo(() => {
    const target = normalizeName(name);
    if (!target) return null;
    return siblings.find((s) => s.id !== row?.id && normalizeName(s.name) === target) ?? null;
  }, [name, siblings, row?.id]);

  /* 저장하고 나면 홈에서 몇 번째 타일이 되는가.
     홈에는 노출 카테고리만 내려가므로 목록 자리가 아니라 '앞선 노출 카테고리 수' 로 센다.
     창 안에서 노출 스위치를 끄면 홈에서는 아예 빠지므로 null 이다.
     이 값 하나로 대체 사진(FALLBACK_IMAGES[i % 8])과 '홈에 안 나옴' 경고가 함께 정해진다. */
  const homeSlot = useMemo(() => {
    if (!isActive) return null;
    if (!row) return siblings.filter((s) => s.is_active).length; // 신규는 항상 맨 뒤
    let seen = 0;
    for (const s of siblings) {
      if (s.id === row.id) return seen;
      if (s.is_active) seen += 1;
    }
    return seen;
  }, [isActive, row, siblings]);

  const willBeBelowHomeFold = homeSlot !== null && homeSlot >= HOME_TILE_LIMIT;

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (!address || !ADDRESS_RE.test(address)) {
      setError(ADDRESS_RULE_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        row ? `/api/admin/categories/${row.id}` : "/api/admin/categories",
        {
          method: row ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            slug: address,
            description: description.trim() || null,
            image_url: imageUrl,
            is_active: isActive,
          }),
        }
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "저장하지 못했습니다.");
      // 신규는 항상 맨 뒤에 붙는다(POST 가 sort_order 를 마지막+1 로 준다).
      // 그 사실을 말해 주지 않으면 "만들었는데 홈에 왜 안 나오지" 를 풀 수 없다.
      onSaved(
        row
          ? `'${trimmedName}' 을 저장했습니다.`
          : `'${trimmedName}' 을 만들었습니다. 목록 맨 뒤에 추가했으니 필요하면 순서를 올려 주세요.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      title={row ? "카테고리 수정" : "새 카테고리"}
      size="lg"
      footer={
        <>
          {row && (
            <button
              type="button"
              onClick={() => onRequestDelete(row)}
              disabled={saving}
              className="mr-auto border border-signal-red px-4 py-2.5 text-sm text-signal-red transition-colors hover:bg-signal-red hover:text-cream-50 disabled:opacity-50"
            >
              카테고리 삭제
            </button>
          )}
          <button type="button" onClick={onClose} disabled={saving} className={BTN_GHOST}>
            취소
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={BTN_PRIMARY}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="divide-y divide-ink-100">
        <FieldRow label="이름" required htmlFor="c-name">
          <Input
            id="c-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 곤약 젤리"
          />
          {duplicateName && (
            <p className="mt-1.5 text-xs leading-relaxed text-signal-amber">
              같은 이름의 카테고리가 이미 있습니다. 그대로 저장하면 고객 화면 탭에 같은 이름이 두
              개 나란히 뜹니다.
            </p>
          )}
          <Help>고객 화면의 카테고리 탭과 홈 타일에 그대로 표시됩니다.</Help>
        </FieldRow>

        <FieldRow label="설명" htmlFor="c-desc" help={DESCRIPTION_USAGE_HELP}>
          <Textarea
            id="c-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 소스·스프 없이 면만 들어 있음"
          />
        </FieldRow>

        <FieldRow label="대표 이미지">
          <CategoryImageField
            value={imageUrl}
            onChange={setImageUrl}
            fallbackImage={homeFallbackImage(homeSlot ?? 0)}
            showsOnHome={homeSlot !== null && homeSlot < HOME_TILE_LIMIT}
          />
        </FieldRow>

        <FieldRow label="고객에게 노출">
          <Toggle checked={isActive} onChange={setIsActive} label={TOGGLE_LABELS.switch} />
          <Help>
            꺼 두면 고객 화면에서 이 카테고리 탭만 사라집니다. 소속 상품은 전체 상품 목록에 그대로
            남습니다.
          </Help>
        </FieldRow>

        {willBeBelowHomeFold && (
          <div className="py-4">
            <p className="border border-[#e8d6ae] bg-[#fbf3e2] px-3.5 py-3 text-xs leading-relaxed text-signal-amber">
              {isNew
                ? `새 카테고리는 목록 맨 뒤에 추가됩니다. 홈 화면에는 노출 카테고리 앞에서 ${HOME_TILE_LIMIT}개까지만 나오므로 이 카테고리는 홈에 보이지 않습니다. 저장한 뒤 목록에서 위로 올려 주세요.`
                : `이 카테고리는 지금 순서로는 홈 화면에 나오지 않습니다. 홈에는 노출 카테고리 앞에서 ${HOME_TILE_LIMIT}개까지만 나옵니다. 목록에서 위로 올리면 홈에 나타납니다.`}
            </p>
          </div>
        )}

        {/* 고급 설정 — 주소는 평소에 숨겨 둔다 */}
        <div className="py-4">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="inline-flex items-center gap-1 text-sm text-ink-600 transition-colors hover:text-forest-700"
          >
            {advancedOpen ? (
              <ChevronDown size={15} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={15} strokeWidth={1.5} />
            )}
            고급 설정 — 고객 화면 주소
          </button>

          {advancedOpen && (
            <div className="mt-3 border border-ink-200 bg-cream-100 p-4">
              <p className="text-xs leading-relaxed text-ink-500">{ADDRESS_USAGE_HELP}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  value={address}
                  readOnly={!addressUnlocked}
                  onChange={(e) => setManualAddress(toAddressForm(e.target.value))}
                  aria-label="고객 화면 주소"
                  className={`max-w-xs ${addressUnlocked ? "" : "bg-cream-200 text-ink-500"}`}
                />
                {!addressUnlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setManualAddress(address);
                      if (isNew) setAddressUnlocked(true);
                      else setShowAddressWarning(true);
                    }}
                    className="border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100"
                  >
                    {isNew ? "주소 직접 정하기" : "주소 바꾸기"}
                  </button>
                )}
                {row && (
                  <a
                    href={storePath(row.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-2 text-xs text-ink-600 transition-colors hover:text-forest-700"
                  >
                    <ExternalLink size={14} strokeWidth={1.5} />
                    지금 주소로 열어 보기
                  </a>
                )}
              </div>

              {showAddressWarning && !addressUnlocked && (
                <div className="mt-3 border border-signal-red bg-cream-50 p-3">
                  <p className="text-xs leading-relaxed text-signal-red">
                    {ADDRESS_CHANGE_WARNING}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAddressUnlocked(true)}
                      className="border border-signal-red px-3 py-1.5 text-xs text-signal-red transition-colors hover:bg-signal-red hover:text-cream-50"
                    >
                      그래도 바꾸겠습니다
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddressWarning(false)}
                      className="px-3 py-1.5 text-xs text-ink-500 transition-colors hover:text-ink-900"
                    >
                      그만두기
                    </button>
                  </div>
                </div>
              )}

              {isNew && !addressUnlocked && (
                <p className="mt-2 text-xs text-ink-400">
                  이름에 맞춰 자동으로 지어집니다. 마음에 들지 않으면 직접 정할 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>

        {error && <p className="pt-3 text-sm text-signal-red">{error}</p>}
      </div>
    </Modal>
  );
}
