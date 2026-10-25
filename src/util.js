/* Small shared helpers. No state lives here. */
(function (global) {
  "use strict";

  const XHTML = "http://www.w3.org/1999/xhtml";
  const SVGNS = "http://www.w3.org/2000/svg";

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function el(tag, cls, text) {
    const node = document.createElementNS(XHTML, tag);
    if (cls) node.setAttribute("class", cls);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(tag, attrs) {
    const node = document.createElementNS(SVGNS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  global.SeedMapUtil = { XHTML, SVGNS, clamp, el, svg, formatInt };
})(typeof window !== "undefined" ? window : globalThis);
