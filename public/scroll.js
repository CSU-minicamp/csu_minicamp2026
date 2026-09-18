/*
 * MinicampScroll —— 轮询刷新时保持窗口显示位置不变。
 *
 * 页面上的刷新都是「拉新数据 → 重绘 DOM」。重绘会把某些块的 HTML 换掉（例如 Q&A 面板
 * 先清空、拿到数据再填回来），这段时间文档高度会短暂变矮，浏览器会把滚动位置夹到 0；
 * 等新内容填回来时，用户刚才看的位置就丢了。
 *
 * 提供两个用法：
 *   MinicampScroll.lock(render, options)          // 同步重绘：立刻还原 + 之后几帧持续校对
 *   MinicampScroll.lockUntil(promise, options)    // 异步刷新：整段异步过程都盯住位置
 *
 * 选项：guard（默认 true）用户自己滚过就不再抢回去；轮询 / 自动刷新传 guard: false，
 * 保证最终一定停回原来的位置。
 * 约定：新的 lock 会让上一个还没结束的校对作废，两次刷新不会互相打架；
 * 弹窗（dialog）等独立滚动区域不受影响。
 */
window.MinicampScroll = (() => {
  /** 当前滚动位置：只认真正负责滚动的元素，避免 html / body 互相干扰。 */
  const rootScroller = () => document.scrollingElement || document.documentElement;
  const raf = callback => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : setTimeout(callback, 16));

  /** 需要保护的滚动容器：视口 + 页面内已经滚起来的块。 */
  const scrollers = () => {
    const list = [];
    const push = element => { if (element && !list.includes(element)) list.push(element); };
    push(rootScroller());
    document.querySelectorAll("*").forEach(element => {
      if (element.scrollTop || element.scrollLeft) push(element);
    });
    return list;
  };

  const capture = () => scrollers().map(element => ({
    element,
    top: element.scrollTop,
    left: element.scrollLeft
  }));

  /**
   * 按「原来的滚动值从大到小」还原：先还原视口，让文档高度回到原状，
   * 再还原页面内部的滚动块，避免顺序不对被浏览器重新夹紧成 0。
   */
  const apply = saved => {
    [...saved].sort((a, b) => (b.top - a.top) || (b.left - a.left)).forEach(item => {
      if (item.element.scrollTop !== item.top) item.element.scrollTop = item.top;
      if (item.element.scrollLeft !== item.left) item.element.scrollLeft = item.left;
    });
  };

  const restores = new Map();
  let token = 0;
  let userScrolled = false;
  const isRoot = element => element === rootScroller() || element === document.documentElement || element === document.body;
  document.addEventListener("scroll", event => {
    if (!isRoot(event.target)) userScrolled = true;
  }, { capture: true, passive: true });

  /**
   * 站点默认 `html { scroll-behavior: smooth }`，会把「还原滚动位置」也变成一段动画，
   * 用户会看到页面从顶部滑回原处。锁定期间临时关掉平滑滚动，还原即时生效。
   */
  const SMOOTH_STYLE_ID = "minicamp-scroll-lock-style";
  const smoothOff = () => {
    if (document.getElementById(SMOOTH_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = SMOOTH_STYLE_ID;
    style.textContent = "html, body { scroll-behavior: auto !important; }";
    (document.head || document.documentElement).appendChild(style);
  };
  const syncSmooth = () => { if (restores.size) smoothOff(); else document.getElementById(SMOOTH_STYLE_ID)?.remove(); };

  /** 每帧校对一次位置；新的刷新开始、用户自己滚动或到达帧数上限时自动收手。 */
  const assert = (id, saved, guard, frames) => {
    if (restores.get(id) !== token) return;
    if (guard && userScrolled) { restores.delete(id); syncSmooth(); return; }
    apply(saved);
    if (frames <= 0) { restores.delete(id); syncSmooth(); return; }
    raf(() => assert(id, saved, guard, frames - 1));
  };

  const begin = (options = {}) => {
    const { guard = true, frames = 12 } = options;
    const saved = capture();
    const id = ++token;
    if (guard) userScrolled = false;
    restores.set(id, token);
    syncSmooth();
    return { id, saved, guard, frames };
  };
  const pin = session => {
    apply(session.saved);
    raf(() => assert(session.id, session.saved, session.guard, session.frames));
  };
  const end = session => {
    apply(session.saved);
    if (restores.get(session.id) === token) restores.delete(session.id);
    setTimeout(() => { if (!restores.size) syncSmooth(); }, 260);
  };

  const lock = (render, options) => {
    const session = begin(options);
    let result;
    try {
      result = typeof render === "function" ? render() : undefined;
    } catch (error) {
      end(session);
      throw error;
    }
    pin(session);
    if (result && typeof result.then === "function") {
      return result.then(value => { end(session); return value; }, error => { end(session); throw error; });
    }
    return result;
  };

  const lockUntil = async (work, options) => {
    const session = begin(options);
    pin(session);
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      end(session);
    }
  };

  return {lock, lockUntil};
})();
