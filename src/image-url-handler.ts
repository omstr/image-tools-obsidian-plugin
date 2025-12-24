import { PluginValue, ViewUpdate } from "@codemirror/view";

export default class ImageUrlHandler implements PluginValue {
  observer: MutationObserver | null = null;
  processed = new WeakSet<HTMLImageElement>();
  pending = new Set<HTMLImageElement>();
  debounceTimer: number | null = null;
  scrollTimer: number | null = null;
  isScrolling = false;
  contentEl: HTMLElement | null = null;
  boundOnScroll: (() => void) | null = null;

  update(update: ViewUpdate) {
    // install once per view instance
    if (this.observer) return;

    const content = update.view.dom.querySelector(".cm-content") as HTMLElement | null;
    if (!content) return;

    this.contentEl = content;

    // scroll guard: set isScrolling while scrolling
    this.boundOnScroll = () => {
      this.isScrolling = true;
      if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
      this.scrollTimer = window.setTimeout(() => {
        this.isScrolling = false;
      }, 200); // ignore mutations for 200ms after last scroll event
    };
    content.addEventListener("scroll", this.boundOnScroll, { passive: true });

    // create observer
    this.observer = new MutationObserver((mutations) => {
      // collect candidate images
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          // if the node itself is an IMG or contains imgs
          if (node.tagName === "IMG") {
            this.queueImage(node as HTMLImageElement);
          } else {
            node.querySelectorAll?.("img").forEach((img: HTMLImageElement) => {
              this.queueImage(img);
            });
          }
        }
      }

      // schedule processing (debounced)
      if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.processPending(), 120);
    });

    this.observer.observe(content, {
      childList: true,
      subtree: true
    });
  }

  queueImage(img: HTMLImageElement) {
    // basic quick checks
    if (!img.parentElement) return;
    if (img.parentElement.classList.contains("image-embed")) return;
    if (img.parentElement.tagName === "DIALOG") return;
    if (this.processed.has(img)) return;

    // add to pending set — final checks will run before wrapping
    this.pending.add(img);
  }

  processPending() {
    // if scrolling, postpone farther
    if (this.isScrolling) {
      // schedule another try after short delay
      if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.processPending(), 250);
      return;
    }

    // run when idle if available (helps avoid disturbing rendering)
    const run = () => {
      if (!this.contentEl) return;

      // iterate over snapshot of pending, but re-check each image before changing
      const toProcess = Array.from(this.pending);
      this.pending.clear();

      for (const img of toProcess) {
        try {
          if (!img.isConnected) continue; // gone
          const parent = img.parentElement;
          if (!parent) continue;
          if (parent.classList.contains("image-embed")) {
            // some other code already wrapped it
            this.processed.add(img);
            continue;
          }
          if (parent.tagName === "DIALOG") continue;

          // Optional: skip images that are still loading / tiny (helps avoid layout measurement moments)
          if (img.naturalWidth === 0 && img.naturalHeight === 0) { 
            // schedule to try again later
            this.pending.add(img);
            continue;
          }

          // Create wrapper and replace safely
          const wrapper = document.createElement("div");
          wrapper.className =
            "internal-embed media-embed image-embed is-loaded image-tools-image-url";
          wrapper.setAttribute("src", img.src);

          // replace child with wrapper then append img
          // using replaceChild keeps DOM operations compact
          parent.replaceChild(wrapper, img);
          wrapper.appendChild(img);

          this.processed.add(img);
        } catch (err) {
          // defensive: don't let one failure stop other work
          console.error("image-tools: error wrapping image", err);
        }
      }
    };

    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(run, { timeout: 500 });
    } else {
      // fallback after small delay
      setTimeout(run, 50);
    }
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.contentEl && this.boundOnScroll) {
      this.contentEl.removeEventListener("scroll", this.boundOnScroll);
    }
    this.contentEl = null;
    this.boundOnScroll = null;
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
    if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
    this.pending.clear();
  }
}
