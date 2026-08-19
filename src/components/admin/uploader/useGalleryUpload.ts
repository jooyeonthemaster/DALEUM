"use client";

/* ============================================================
   사진 올리기 로직 — 화면(타일 배치·순서·자르기)과 떼어 놓는다.

   이 갈래는 규칙이 제법 많다: 사진이 아닌 파일 걸러내기, 장수 상한,
   이름이 겹치는 사진 알리기, 세로로 긴 사진 골라내기, 장별 실패 모으기.
   이걸 렌더 코드와 한 파일에 두면 "어떤 조건에서 무엇이 화면에 뜨는지" 를
   따라가기 어려워져서, 상태와 판단은 전부 여기로 모았다.

   가장 중요한 원칙: **첫 위반에서 통째로 멈추지 않는다.**
   예전 업로더는 6장 중 1장만 규격을 벗어나도 6장 전부를 취소했고,
   어느 파일이 걸렸는지도 알려 주지 않았다.
   ============================================================ */

import { useCallback, useState } from "react";
import {
  describeAsset,
  isImageFile,
  uploadGalleryImages,
  type UploadBucket,
  type UploadedAsset,
} from "@/lib/admin-upload";
import { guessRole, readImageMeta } from "@/lib/image-pipeline";
import type { UploadFailure, UploadProgressInfo } from "./UploadStatus";

/** 이번에 올린 사진에 대해 우리가 아는 것 — 화면에 크기를 적어 주기 위한 값 */
export interface AssetInfo {
  width: number;
  height: number;
  name: string;
}

/** 상세페이지용으로 보이는(세로로 아주 긴) 후보 */
export interface TallCandidate {
  file: File;
  label: string;
}

export interface UseGalleryUploadArgs {
  bucket: UploadBucket;
  prefix: string;
  multiple: boolean;
  /** 등록 가능한 최대 장수 */
  limit: number;
  /** 지금 화면에 들어 있는 장수 — 남은 칸 계산에 쓴다 */
  count: number;
  /** 올라간 사진을 화면 목록에 반영한다 */
  onUploaded: (assets: UploadedAsset[]) => void;
}

/**
 * 브라우저가 던지는 예외 문구는 영어다(아이폰 HEIC 를 열지 못할 때 등).
 * 관리자 화면에 영문 오류가 그대로 나가면 무엇을 해야 하는지 알 수 없으므로
 * 한국어가 한 글자도 없는 문구는 우리 문장으로 바꿔 준다.
 */
function humanReason(reason: string): string {
  if (/[가-힣]/.test(reason)) return reason;
  return "이 사진은 브라우저가 열지 못했습니다. JPG·PNG·WebP 로 바꿔서 올려 주세요.";
}

export function useGalleryUpload({
  bucket,
  prefix,
  multiple,
  limit,
  count,
  onUploaded,
}: UseGalleryUploadArgs) {
  const [info, setInfo] = useState<Record<string, AssetInfo>>({});
  const [progress, setProgress] = useState<UploadProgressInfo | null>(null);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [tall, setTall] = useState<TallCandidate[]>([]);

  const remember = useCallback((assets: UploadedAsset[]) => {
    if (assets.length === 0) return;
    setInfo((prev) => {
      const next = { ...prev };
      for (const asset of assets) {
        next[asset.url] = { width: asset.width, height: asset.height, name: asset.sourceName };
      }
      return next;
    });
  }, []);

  /** 실제 전송 — 성공한 장은 즉시 반영하고, 실패한 장만 따로 남긴다 */
  const uploadFiles = useCallback(
    async (files: File[], carriedNotes: string[] = []) => {
      if (files.length === 0) {
        setNotes(carriedNotes);
        return;
      }
      setProgress({ done: 0, total: files.length, name: files[0].name });
      try {
        const { uploaded, failures: failed } = await uploadGalleryImages(files, {
          bucket,
          prefix,
          onProgress: (done, total, name) => setProgress({ done, total, name }),
        });
        remember(uploaded);
        if (uploaded.length > 0) onUploaded(uploaded);
        setFailures(failed.map((f) => ({ name: f.name, reason: humanReason(f.reason) })));
        setNotes(carriedNotes);
      } catch (e) {
        // uploadGalleryImages 는 장별 실패를 스스로 삼키므로, 여기까지 오면 예상 밖의 사고다
        setFailures([
          { name: "사진 올리기", reason: humanReason(e instanceof Error ? e.message : "") },
        ]);
      } finally {
        setProgress(null);
      }
    },
    [bucket, prefix, onUploaded, remember]
  );

  /**
   * 고른 파일을 분류한 뒤 통과한 것만 올린다.
   * 막는 것은 장수 상한 하나뿐이고, 나머지는 알리기만 한다 —
   * 판정을 지나치게 믿고 막으면 정상적인 사진을 올릴 길이 사라진다.
   */
  const ingest = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      setFailures([]);
      setNotes([]);
      setTall([]);

      const rejected: UploadFailure[] = [];
      let files = incoming.filter((f) => {
        if (isImageFile(f)) return true;
        rejected.push({ name: f.name, reason: "사진 파일이 아니라 건너뛰었습니다." });
        return false;
      });
      if (rejected.length > 0) setFailures(rejected);
      if (!multiple) files = files.slice(0, 1);

      const carried: string[] = [];
      if (multiple) {
        const room = Math.max(0, limit - count);
        if (room === 0) {
          setNotes([
            `사진은 ${limit}장까지 등록할 수 있습니다. 먼저 몇 장을 지운 뒤 다시 올려 주세요.`,
          ]);
          return;
        }
        if (files.length > room) {
          carried.push(
            `사진은 ${limit}장까지 등록할 수 있습니다. 지금 ${count}장이라 ${room}장만 추가합니다.`
          );
          files = files.slice(0, room);
        }
        // 같은 사진을 두 번 올려도 막는 장치가 없어 고객 갤러리에 같은 썸네일이 두 칸 뜨곤 했다.
        // 이름이 같다고 반드시 같은 사진은 아니므로, 막지 않고 알려만 준다.
        const known = new Set(Object.values(info).map((a) => a.name));
        for (const file of files) {
          if (known.has(file.name)) {
            carried.push(`'${file.name}' 은 이미 올린 사진과 이름이 같습니다. 확인해 주세요.`);
          }
        }
      }

      // 세로로 긴 사진 골라내기 — 여러 장 모드(상품 갤러리)에서만 따진다.
      // 배너·팝업은 한 장짜리 전면 이미지라 이 판정이 의미가 없다.
      const normal: File[] = [];
      const suspicious: TallCandidate[] = [];
      for (const file of files) {
        if (!multiple) {
          normal.push(file);
          continue;
        }
        try {
          const meta = await readImageMeta(file);
          if (guessRole(meta) === "detail") {
            suspicious.push({
              file,
              label: `${file.name} · ${describeAsset(meta.width, meta.height, meta.bytes)}`,
            });
            continue;
          }
        } catch {
          // 치수를 못 읽었다고 업로드까지 막을 이유는 없다 — 올려 보고 실패하면 그때 알린다
        }
        normal.push(file);
      }

      if (suspicious.length > 0) setTall(suspicious);
      await uploadFiles(normal, carried);
    },
    [multiple, limit, count, info, uploadFiles]
  );

  /**
   * 한 장을 그 자리에서 바꿔치기한다(자르기 결과 등).
   * 목록에 끼워 넣는 일은 호출부가 하므로 여기서는 올리고 결과만 돌려준다.
   */
  const replaceOne = useCallback(
    async (file: File, previousUrl: string): Promise<UploadedAsset | null> => {
      const { uploaded, failures: failed } = await uploadGalleryImages([file], { bucket, prefix });
      const asset = uploaded[0] ?? null;
      if (asset) {
        // 원본 파일명은 자르기 전 사진의 것을 물려받는다 — 무슨 사진이었는지 놓치지 않으려고
        setInfo((prev) => ({
          ...prev,
          [asset.url]: {
            width: asset.width,
            height: asset.height,
            name: prev[previousUrl]?.name ?? "잘라낸 사진",
          },
        }));
      }
      setFailures(failed.map((f) => ({ name: f.name, reason: humanReason(f.reason) })));
      return asset;
    },
    [bucket, prefix]
  );

  const dismissTall = useCallback(() => setTall([]), []);

  /** 경고를 보고도 상품 사진으로 넣겠다고 했을 때 */
  const uploadTallAnyway = useCallback(() => {
    const files = tall.map((t) => t.file);
    setTall([]);
    void uploadFiles(files);
  }, [tall, uploadFiles]);

  return {
    info,
    progress,
    failures,
    notes,
    tall,
    ingest,
    replaceOne,
    dismissTall,
    uploadTallAnyway,
  };
}
