import {PluginValue, ViewUpdate} from "@codemirror/view";
import MDText from "./md-text";

export default class ResizeIconsItem implements PluginValue {
  rightResizeIconClassName = "right-resize-icon-class-name image-tools-resize-item image-tools-resize-item-right"
  leftResizeIconClassName = "left-resize-icon-class-name image-tools-resize-item image-tools-resize-item-left"
  viewUpdate: ViewUpdate | undefined
  view: any // keep a reference to the current view

  update(update: ViewUpdate) {
    this.viewUpdate = update
    this.view = update.view
    // no longer store mdText here - we'll construct it from the current doc when committing

    const images = update.view.dom.getElementsByClassName("image-embed")

    Array.from(images).forEach(img => {
      const classes = Array.from(img.children).map(x => x.className)
      if (img.children[0].tagName === "IMG" && !(classes.includes(this.rightResizeIconClassName))) {
        this.addRightResizeIcon(img.children[0])
      }
    })

    Array.from(images).forEach(img => {
      const classes = Array.from(img.children).map(x => x.className)
      if (img.children[0].tagName === "IMG" && !(classes.includes(this.leftResizeIconClassName))) {
        this.addLeftResizeIcon(img.children[0])
      }
    })
  }

  addRightResizeIcon(item: any) {
    const icon = document.createElement("div")
    icon.className = this.rightResizeIconClassName

    icon.addEventListener("mousedown", (e) => {
      const startX = e.clientX;

      let startWidth = 0
      if (document.defaultView) {
        startWidth = parseInt(document?.defaultView?.getComputedStyle(item).width, 10);
      }

      // track current width while moving, but do NOT dispatch editor changes here
      const mousemove = (e: any) => {
        const newWidth = Math.max(1, startWidth + e.clientX - startX)
        // update DOM only for immediate visual feedback
        item.style.width = `${newWidth}px`
        item.setAttribute("width", `${newWidth}px`)
      }

      // commit a single editor change on mouseup using the latest document state
      const mouseup = (e: any) => {
        const finalWidth = parseInt(item.style.width || item.getAttribute("width") || "0", 10)
        this.commitNewWidthToDoc(item, finalWidth)
        document.documentElement.removeEventListener('mousemove', mousemove, false);
        document.documentElement.removeEventListener('mouseup', mouseup, false);
      }

      document.documentElement.addEventListener('mousemove', mousemove, false);
      document.documentElement.addEventListener('mouseup', mouseup, false);
    })

    item.parentNode?.append(icon)
  }

  addLeftResizeIcon(item: any) {
    const icon = document.createElement("div")
    icon.className = this.leftResizeIconClassName

    icon.addEventListener("mousedown", (e) => {
      const startX = e.clientX;

      let startWidth = 0
      if (document.defaultView) {
        startWidth = parseInt(document?.defaultView?.getComputedStyle(item).width, 10);
      }

      const mousemove = (e: any) => {
        const newWidth = Math.max(1, startWidth - e.clientX + startX)
        // update DOM only for immediate visual feedback
        item.style.width = `${newWidth}px`
        item.setAttribute("width", `${newWidth}px`)
      }

      const mouseup = (e: any) => {
        const finalWidth = parseInt(item.style.width || item.getAttribute("width") || "0", 10)
        this.commitNewWidthToDoc(item, finalWidth)
        document.documentElement.removeEventListener('mousemove', mousemove, false);
        document.documentElement.removeEventListener('mouseup', mouseup, false);
      }

      document.documentElement.addEventListener('mousemove', mousemove, false);
      document.documentElement.addEventListener('mouseup', mouseup, false);
    })

    item.parentNode?.append(icon)
  }

  /**
   * Commit the final width to the editor document.
   * This computes indexes from the CURRENT document text (not from stale state),
   * sets the image width in the parsed ImageText, and dispatches a single change.
   */
  commitNewWidthToDoc(img: any, newWidth: number) {
    if (!this.view) return

    // derive the identifier you used previously (the plugin used parentNode.getAttribute("src"))
    const imgName = img.parentNode.getAttribute("src")
    if (!imgName) return

    // build fresh MDText from the current document
    const mdText = new MDText(this.view.state.doc.toString())

    // find indexes in the up-to-date doc
    const [indexStart, indexEnd] = mdText.getImageIndexes(imgName)
    if (indexStart === 0 && indexEnd === 0) {
      // nothing found in current doc; abort safely
      return
    }

    // get the ImageText object from the current slice and update its width
    const imageText = mdText.getImageText(imgName)
    imageText.setWidth(newWidth.toString())

    const replacement = imageText.getImageText()

    // dispatch a single change using the current view (avoid using any old viewUpdate)
    this.view.dispatch({
      changes: { from: indexStart, to: indexEnd, insert: replacement },
      // optional: provide a userEvent tag so it's clear this transaction came from the plugin
      userEvent: "image-tools-resize"
    })
  }
}
