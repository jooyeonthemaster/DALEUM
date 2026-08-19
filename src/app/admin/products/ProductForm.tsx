"use client";

/* ============================================================
   상품 등록/편집 폼 본체 — 네 탭을 묶고, 저장 한 번의 결과를 끝까지 책임진다.

   이번에 바로잡은 것(전부 실제로 사람의 작업을 잃게 만들던 자리다):
   - 저장하지 않은 내용을 들고 화면을 벗어나도 아무도 붙잡지 않았다 → 자동 임시 저장 + 이탈 확인.
   - 저장이 막히면 이유를 하나만, 그것도 화면 맨 위에만 알려 줬다 → 전부 모아서, 탭 배지로,
     저장 실패 시 문제 있는 탭으로 데려간다.
   - 신규 등록은 서버가 돌려주는 경고(이미지·옵션 저장 실패)를 읽기도 전에 화면을 옮겨 버렸다
     → 경고가 있으면 옮기지 않고 그대로 보여 준다.
   - 브랜드·공급처 입력칸은 있는데 저장 꾸러미에 없었다 → payload.ts 에서 함께 보낸다.
   - 사진 설명(alt)을 불러오지도 보내지도 않아, 저장만 눌러도 전부 상품명으로 덮어써졌다.

   화면 조각(머리말·탭·저장 바·확인창·결과 띠)은 _form/ 아래로 나눠 두었다.
   여기 남은 것은 상태와 '무엇을 언제 하는가' 뿐이다.
   ============================================================ */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProductStatus, ProductWithImages } from "@/lib/types";
import { slugify } from "@/lib/format";
import type { DetailBlock } from "@/lib/detail-doc";
import { BTN_GHOST } from "./product-ui";
import { EMPTY_FORM, toIntOrNull, type FormState, type KvRow, type VariantDraft } from "./form-types";
import FormDialogs from "./_form/FormDialogs";
import FormHeader from "./_form/FormHeader";
import FormResult, { type SaveResult } from "./_form/FormResult";
import FormTabPanels from "./_form/FormTabPanels";
import FormTabs from "./_form/FormTabs";
import PreviewModal from "./_form/PreviewModal";
import SaveBar from "./_form/SaveBar";
import { DraftRestoreBanner, IssueBanner } from "./_form/FormBanners";
import { buildPayload } from "./_form/payload";
import { snapshotFromProduct } from "./_form/snapshot";
import {
  draftKey,
  writeClone,
  writeFlash,
  type ProductFormSnapshot,
  type ProductImageDraft,
} from "./_form/draft-storage";
import { useCategories, useFormHandoff, useProductLoad } from "./_form/useFormBootstrap";
import { useProductDraft } from "./_form/useProductDraft";
import { useUnsavedGuard } from "./_form/useUnsavedGuard";
import { countIssuesByTab, validateProduct, type FormIssue, type FormTabKey } from "./_form/validate";

export default function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isNew = !productId;

  const [draftId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const imagePrefix = productId ?? `drafts/${draftId}`;

  const [tab, setTab] = useState<FormTabKey>("basic");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<ProductImageDraft[]>([]);
  // 상세페이지 본문은 마크다운 문자열이 아니라 칸 목록으로 들고 있는다 —
  // 저장 직전에만 원문으로 직렬화한다(고객 화면 렌더 계약은 그대로).
  const [detailBlocks, setDetailBlocks] = useState<DetailBlock[]>([]);
  /**
   * 상품 사진 탭에서 상세페이지 쪽으로 넘긴 사진.
   *
   * 세로로 아주 긴 사진을 상품 사진에 넣으면 목록 썸네일이 세로로 늘어진다
   * (과거에 실제로 났던 사고 — scripts/fix_tall_gallery_images.mjs).
   * 그래서 업로더가 "상세페이지로 보내기" 를 권하는데, 그때 관리자가 탭을 옮겨 같은 파일을
   * 다시 고르게 하면 권해 봐야 소용이 없다. 파일을 그대로 들고 넘어간다.
   * 일련번호를 함께 두는 이유: 같은 파일을 두 번 보내도 새 반입으로 알아보게 하려는 것이다.
   */
  const [detailIntake, setDetailIntake] = useState<{ id: number; files: File[] } | null>(null);
  const intakeSeq = useRef(0);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [nutritionRows, setNutritionRows] = useState<KvRow[]>([]);
  const [specRows, setSpecRows] = useState<KvRow[]>([]);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  /** 등록에는 성공했지만 이미지·옵션이 함께 저장되지 않은 경우의 상품 id — 중복 등록을 막는다 */
  const [createdId, setCreatedId] = useState<string | null>(null);
  /** 오류 목록은 한 번이라도 저장을 눌러 본 뒤에만 보여 준다(빈 폼을 열자마자 빨간 배지가 뜨면 겁만 준다) */
  const [showIssues, setShowIssues] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  const {
    categories,
    loading: categoriesLoading,
    failed: categoriesFailed,
  } = useCategories();

  /* 상품 주소 칸의 펼침 여부를 폼이 들고 있는 이유는 goToIssue 때문이다 —
     아래 주석 참고. 칸 안에 가둬 두면 밖에서 펼쳐 줄 방법이 없다. */
  const [addressOpen, setAddressOpen] = useState(false);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const snapshot: ProductFormSnapshot = useMemo(
    () => ({ form, images, detailBlocks, variants, nutritionRows, specRows }),
    [form, images, detailBlocks, variants, nutritionRows, specRows]
  );

  const applySnapshot = useCallback((snap: ProductFormSnapshot) => {
    setForm(snap.form);
    setImages(snap.images);
    setDetailBlocks(snap.detailBlocks);
    setVariants(snap.variants);
    setNutritionRows(snap.nutritionRows);
    setSpecRows(snap.specRows);
  }, []);

  const { dirty, offer, discardOffer, acceptOffer, draftSavedAt, clearSavedDraft, markBaseline } =
    useProductDraft({
      key: draftKey(productId),
      snapshot,
      needsLoad: !isNew,
    });

  const issues = useMemo(() => validateProduct({ form, variants, isNew }), [form, variants, isNew]);
  const issueCounts = useMemo(() => countIssuesByTab(issues), [issues]);

  /* ---------- 이탈 방어 ----------
     등록은 됐는데 일부가 저장되지 않은 상태(createdId)에서는 붙잡지 않는다 —
     그 화면에서 할 일은 '등록된 상품 열기' 로 나가는 것뿐이다. */
  const onIntercept = useCallback((href: string) => setPendingHref(href), []);
  useUnsavedGuard(dirty && !saving && createdId === null, onIntercept);

  /** 상품을 화면에 얹고, 그 상태를 '저장된 상태' 로 기록한다 */
  const populate = useCallback(
    (p: ProductWithImages) => {
      const snap = snapshotFromProduct(p);
      applySnapshot(snap);
      markBaseline(snap);
    },
    [applySnapshot, markBaseline]
  );

  const { loading, loadError, hasOrders } = useProductLoad(productId, populate);

  useFormHandoff({
    isNew,
    applySnapshot,
    onNotice: useCallback(
      (notice: { title: string; detail?: string }) => setResult({ tone: "ok", ...notice }),
      []
    ),
    /* 복제해 온 내용을 얹은 직후 — 주소는 사람이 정한 값으로 굳히고, 이 자리('new')에 남아 있던
       옛 초안 제안은 버린다. 남겨 두면 복제본 위에 '이어서 작성하시겠어요?' 가 떠서,
       그것을 누르는 순간 방금 복제해 온 내용이 지난번에 만들다 만 상품으로 바뀐다. */
    onCloneApplied: useCallback(() => {
      setSlugTouched(true);
      discardOffer();
    }, [discardOffer]),
  });

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      ...(isNew && !slugTouched ? { slug: slugify(name) } : {}),
    }));
  }

  function goToIssue(issue: FormIssue) {
    setTab(issue.tab);
    if (!issue.focusId) return;
    /* 상품 주소 칸은 기본적으로 접혀 있어 입력 자체가 화면에 없다. 예전에는 그럴 때
       '못 찾으면 그냥 넘어간다' 로 두었는데, 하필 신규 등록에서 저장을 막는 유일한 칸이 그것이라
       오류 문구를 눌러도 아무 일도 일어나지 않았다. 커서를 옮기기 전에 먼저 펼친다. */
    if (issue.focusId === "p-slug") setAddressOpen(true);
    // 탭이 바뀌고 칸이 펼쳐진 뒤에야 그 입력이 화면에 있다 — 그리기가 끝난 다음 프레임에 커서를 옮긴다.
    requestAnimationFrame(() => document.getElementById(issue.focusId!)?.focus());
  }

  async function save(statusOverride?: ProductStatus) {
    const effectiveForm = statusOverride ? { ...form, status: statusOverride } : form;
    const found = validateProduct({ form: effectiveForm, variants, isNew });
    if (found.length > 0) {
      setShowIssues(true);
      setResult(null);
      setTab(found[0].tab);
      // 저장 버튼은 화면 맨 아래, 오류 목록은 맨 위에 있다 — 스크롤한 채 눌렀을 때
      // '아무 일도 안 일어난' 것처럼 보이지 않도록 목록으로 데려간다.
      requestAnimationFrame(() =>
        bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
      return;
    }
    if (statusOverride) setForm(effectiveForm);
    setSaving(true);
    setResult(null);

    const payload = buildPayload({
      form: effectiveForm,
      images,
      detailBlocks,
      variants,
      nutritionRows,
      specRows,
      isNew,
    });

    try {
      const res = await fetch(isNew ? "/api/admin/products" : `/api/admin/products/${productId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { product?: ProductWithImages; warning?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "저장에 실패했습니다.");

      clearSavedDraft();
      setShowIssues(false);

      if (isNew && data?.product) {
        if (data.warning) {
          /* 여기서 화면을 옮기면 경고가 그대로 사라진다. 실제로 옛 폼이 그랬고, 사진 7장을 올린
             관리자는 이미지 탭이 0장이 된 편집 화면만 보게 됐다 — 무엇이 실패했는지 모른 채. */
          setCreatedId(data.product.id);
          markBaseline({ ...snapshot, form: effectiveForm });
          setResult({
            tone: "error",
            title: "상품은 등록되었지만 일부 내용이 함께 저장되지 않았습니다.",
            detail: data.warning,
          });
          return;
        }
        writeFlash({
          productName: data.product.name,
          hidden: data.product.status === "draft" || data.product.status === "hidden",
        });
        router.replace(`/admin/products/${data.product.id}`);
        return;
      }

      if (data?.product) populate(data.product);
      else markBaseline({ ...snapshot, form: effectiveForm });
      setResult(
        data?.warning
          ? {
              tone: "error",
              title: "저장은 되었지만 일부 내용에 문제가 있습니다.",
              detail: data.warning,
            }
          : { tone: "ok", title: "저장되었습니다." }
      );
    } catch (e) {
      setResult({ tone: "error", title: e instanceof Error ? e.message : "저장에 실패했습니다." });
    } finally {
      setSaving(false);
    }
  }

  function duplicate() {
    // 주소·상품 코드는 겹치면 서버가 거절하므로 새로 만들고, 재고와 옵션 식별자는 0 부터 시작한다.
    const name = `${form.name} (사본)`;
    writeClone({
      form: { ...form, name, slug: slugify(name), sku: "", stock: "0", status: "draft" },
      images,
      detailBlocks,
      variants: variants.map((v) => ({ ...v, id: null, stock: "0", expectedStock: null, sku: "" })),
      nutritionRows,
      specRows,
    });
    router.push("/admin/products/new");
  }

  async function doDelete() {
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "삭제에 실패했습니다.");
      }
      router.replace("/admin/products");
    } catch (e) {
      setResult({ tone: "error", title: e instanceof Error ? e.message : "삭제에 실패했습니다." });
    }
  }

  if (loadError) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">{loadError}</p>
        <Link href="/admin/products" className={`${BTN_GHOST} mt-6 inline-block`}>
          상품 목록으로
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse bg-cream-100" />
        <div className="h-10 w-full animate-pulse bg-cream-100" />
        <div className="h-64 w-full animate-pulse bg-cream-100" />
      </div>
    );
  }

  const hiddenFromCustomers = form.status === "draft" || form.status === "hidden";

  return (
    <div>
      <FormHeader
        isNew={isNew}
        title={form.name}
        slug={form.slug}
        status={form.status}
        saved={!isNew}
        onPreview={() => setPreviewOpen(true)}
        onDuplicate={duplicate}
      />

      {/* scroll-mt-20(=80px): 저장 실패 시 이 자리로 스크롤하는데, 관리자 머리말이
          sticky h-14(56px)라 그냥 맞추면 오류 목록의 제목과 첫 줄이 머리말 뒤로 들어갔다.
          '고쳐야 할 곳 3군데' 라고 해 놓고 2건만 보이니 숫자가 틀린 것처럼 보였다. */}
      <div ref={bannerRef} className="scroll-mt-20">
        {offer && (
          <DraftRestoreBanner
            savedAt={offer.savedAt}
            onRestore={() => {
              applySnapshot(offer.snapshot);
              acceptOffer();
            }}
            onDiscard={discardOffer}
          />
        )}

        <FormResult
          result={result}
          isNew={isNew}
          saving={saving}
          createdId={createdId}
          slug={form.slug}
          status={form.status}
          onStartSelling={() => void save("active")}
          onDuplicate={duplicate}
        />

        <IssueBanner issues={showIssues ? issues : []} onGoTo={goToIssue} />
      </div>

      <FormTabs
        tabs={[
          { key: "basic", label: "기본 정보", errors: showIssues ? issueCounts.basic : 0 },
          { key: "images", label: "이미지", count: images.length },
          {
            key: "variants",
            label: "옵션",
            count: variants.length,
            errors: showIssues ? issueCounts.variants : 0,
          },
          { key: "detail", label: "상세·영양" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      <FormTabPanels
        tab={tab}
        isNew={isNew}
        form={form}
        set={set}
        onNameChange={handleNameChange}
        onSlugChange={(slug) => {
          setSlugTouched(true);
          set("slug", slug);
        }}
        categories={categories}
        categoriesLoading={categoriesLoading}
        categoriesFailed={categoriesFailed}
        addressOpen={addressOpen}
        onAddressOpenChange={setAddressOpen}
        images={images}
        setImages={setImages}
        imagePrefix={imagePrefix}
        variants={variants}
        setVariants={setVariants}
        basePrice={toIntOrNull(form.price)}
        detailBlocks={detailBlocks}
        setDetailBlocks={setDetailBlocks}
        onSendToDetail={(files) => {
          intakeSeq.current += 1;
          setDetailIntake({ id: intakeSeq.current, files });
          setTab("detail");
        }}
        detailIntake={detailIntake}
        onDetailIntakeDone={() => setDetailIntake(null)}
        nutritionRows={nutritionRows}
        setNutritionRows={setNutritionRows}
        specRows={specRows}
        setSpecRows={setSpecRows}
      />

      <SaveBar
        isNew={isNew}
        saving={saving}
        canDelete={!isNew}
        hasOrders={hasOrders}
        onDelete={() => setDeleteStep(1)}
        onSave={() => void save()}
        dirty={dirty}
        draftSavedAt={draftSavedAt}
        hiddenFromCustomers={hiddenFromCustomers}
        issueCount={showIssues ? issues.length : 0}
      />

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        form={form}
        images={images}
        categories={categories}
        variantCount={variants.length}
      />

      <FormDialogs
        pendingHref={pendingHref}
        onCancelLeave={() => setPendingHref(null)}
        onConfirmLeave={() => {
          const href = pendingHref;
          setPendingHref(null);
          if (href) router.push(href);
        }}
        deleteStep={deleteStep}
        productName={form.name}
        onDeleteStep={setDeleteStep}
        onDelete={doDelete}
      />
    </div>
  );
}
