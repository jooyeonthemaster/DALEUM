"use client";

/* ============================================================
   저장하지 않은 내용을 들고 화면을 벗어나려 할 때 붙잡는다.

   상품 삭제에는 2단계 확인창이 있는데, 정작 30분 작성한 내용을 날리는 '취소' 와 좌측 사이드바
   클릭에는 아무 방어가 없었다. 링크 한 번이면 그대로 사라진다.

   막아야 하는 길이 두 갈래다.
   1) 브라우저가 페이지를 버리는 경우(새로고침·탭 닫기·주소창 이동) → beforeunload.
   2) 화면 안 링크로 옮겨 가는 경우(취소·상품 목록·좌측 사이드바) → 이건 브라우저가
      아무것도 묻지 않는다. 그래서 클릭을 **캡처 단계**에서 가로챈다. 사이드바는 이 폼이
      소유한 파일이 아니라 링크마다 손을 댈 수 없고, 손댈 수 있더라도 새 링크가 생길 때마다
      또 빠뜨린다 — 문서 한 곳에서 걸러 내는 편이 확실하다.

   뒤로가기(popstate)는 여기서 막지 않는다. 히스토리에 가짜 항목을 끼워 넣어야 하는데,
   그 방식은 뒤로가기를 두 번 눌러야 나가지는 등 다른 고장을 만든다. 대신 초안 자동 저장이
   받쳐 주므로 되돌아오면 이어서 쓸 수 있다.
   ============================================================ */

import { useEffect } from "react";

/**
 * @param active 붙잡아야 하는 상태인지(변경사항 있음 + 저장 중 아님)
 * @param onIntercept 화면 안 링크를 가로챘을 때 호출 — 확인창을 띄우는 쪽이 받는다
 */
export function useUnsavedGuard(active: boolean, onIntercept: (href: string) => void): void {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // 문구는 브라우저가 자기 것으로 대체한다 — preventDefault 만이 실제로 창을 띄운다.
      e.preventDefault();
      e.returnValue = "";
    };

    const onClick = (e: MouseEvent) => {
      // 새 탭으로 열려는 클릭(가운데 버튼·Ctrl/⌘)은 이 화면을 떠나지 않으므로 그대로 둔다.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      // 사이드바 링크에 자체 onClick(메뉴 닫기 등)이 걸려 있을 수 있어 전파까지 끊는다.
      e.stopPropagation();
      onIntercept(url.pathname + url.search);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, onIntercept]);
}
