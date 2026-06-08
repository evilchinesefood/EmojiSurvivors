// Tiny hyperscript helper — creates real DOM nodes (no reconciler needed; screens
// are built/torn down whole on state change). Props: class, style, html, on<Event>,
// prop:<name> (assigns a DOM property, e.g. WA component props), boolean attrs.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith("prop:")) el[k.slice(5)] = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else
      el.appendChild(
        c instanceof Node ? c : document.createTextNode(String(c)),
      );
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(host, node) {
  clear(host);
  if (node) host.appendChild(node);
}
