import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/auth";
// 상한은 여기서 정하지 않는다 — 화면·서버가 같은 숫자를 보게 lib 의 상수 하나만 쓴다.
// (전에는 여기 5MB, image-pipeline 8MB, 일괄 등록 화면 5MB 로 갈라져 있었다)
import { UPLOAD_MAX_BYTES, humanBytes } from "@/lib/image-pipeline";

/** 허용 이미지 MIME → 확장자 (SVG는 스크립트 삽입 위험으로 제외) */
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const ALLOWED_BUCKETS = ["products", "banners", "reviews"];

/**
 * POST /api/admin/upload
 * FormData: file(필수), bucket(기본 products), prefix(선택)
 * → { url: publicUrl }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }

  const ext = MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "이미지 파일(JPG·PNG·WebP·GIF·AVIF)만 업로드할 수 있습니다." },
      { status: 400 }
    );
  }

  if (file.size > UPLOAD_MAX_BYTES) {
    // 관리자 화면은 올리기 전에 사진을 줄여서 보낸다(lib/admin-upload.ts).
    // 여기까지 큰 파일이 왔다면 그 전처리를 건너뛴 경로가 있다는 뜻이라, 사람에게는
    // "줄여서 다시" 가 아니라 "다시 시도" 를 안내하는 편이 실제 해결에 가깝다.
    return NextResponse.json(
      {
        error: `사진이 너무 큽니다(${humanBytes(file.size)}). 화면을 새로 고친 뒤 다시 올려 주세요. 한 장당 ${humanBytes(UPLOAD_MAX_BYTES)}까지 받을 수 있습니다.`,
      },
      { status: 400 }
    );
  }

  const bucketRaw = form.get("bucket");
  const bucket = typeof bucketRaw === "string" && bucketRaw ? bucketRaw : "products";
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: "허용되지 않은 버킷입니다." }, { status: 400 });
  }

  // prefix 정리 — 영문/숫자/하이픈/언더스코어/슬래시만 허용
  const prefixRaw = form.get("prefix");
  const prefix =
    typeof prefixRaw === "string"
      ? prefixRaw.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "")
      : "";

  // 공유 버킷 — 스토어 스코프 프리픽스(daleum/) 필수 (suhn/tomato와 버킷 공유)
  const path = `daleum/${prefix ? `${prefix}/` : ""}${randomUUID()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(path, bytes, { contentType: file.type, cacheControl: "3600", upsert: false });

  if (uploadError) {
    return NextResponse.json(
      { error: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  const { data } = service.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
