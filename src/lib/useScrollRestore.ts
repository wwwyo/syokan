import { type RefObject, useEffect } from "react";

/**
 * scroll container の位置を sessionStorage に保存し、再訪 (full reload 遷移を含む) 時に
 * 復元する。document ではなく内側の overflow 要素が scroll するため、ブラウザ標準の
 * scroll 復元が効かない領域 (sidebar 一覧 / snapshot 本文) を補う。
 *
 * - 保存: scroll のたび。
 * - 復元: 中身は mount 後に非同期 load されるので、保存位置まで高さが伸びた瞬間を
 *   observer で捉えて一度だけ復元する (高さ変化を ResizeObserver、loading→list の
 *   子の差し替えを MutationObserver で見る)。ユーザーが先に scroll したらやめる。
 *
 * key は復元単位。sidebar は固定 key、本文は pathname 込みの key を渡して領域ごとに分ける。
 */
export function useScrollRestore(
  ref: RefObject<HTMLElement | null>,
  key: string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const save = () => {
      try {
        window.sessionStorage.setItem(key, String(el.scrollTop));
      } catch {
        // storage 不可環境では諦める
      }
    };

    let saved = 0;
    try {
      saved = Number(window.sessionStorage.getItem(key)) || 0;
    } catch {
      saved = 0;
    }

    let done = saved <= 0; // 復元するものが無ければ最初から保存のみ
    let resize: ResizeObserver | null = null;
    let mutation: MutationObserver | null = null;
    const stop = () => {
      done = true;
      resize?.disconnect();
      mutation?.disconnect();
      resize = null;
      mutation = null;
    };
    const tryRestore = () => {
      if (done) return;
      if (el.scrollHeight - el.clientHeight >= saved) {
        el.scrollTop = saved;
        stop();
      }
    };

    if (!done) {
      resize = new ResizeObserver(tryRestore);
      const observeChildren = () => {
        resize?.disconnect();
        for (const child of el.children) resize?.observe(child);
      };
      mutation = new MutationObserver(() => {
        observeChildren();
        tryRestore();
      });
      mutation.observe(el, { childList: true });
      observeChildren();
      tryRestore(); // 既に十分な高さなら即復元 (Home / cache 済み)
    }

    const onScroll = () => {
      stop(); // 復元後 or ユーザー操作。以降は保存のみ。
      save();
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      stop();
      el.removeEventListener("scroll", onScroll);
    };
  }, [key]);
}
