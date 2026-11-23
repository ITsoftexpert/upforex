/** Portable rich-text messages: style, URLs and element attributes stay in
 * the original document. Catalogs contain text and numbered inline slots. */
export interface ContentNode {
  nodeName: string;
  nodeType?: number;
  nodeValue?: string | null;
  value?: string;
  childNodes?: ArrayLike<ContentNode>;
  attrs?: { name: string; value: string }[];
  getAttribute?: (name: string) => string | null;
}

export interface RichContentUnit {
  nodes: ContentNode[];
  message: string;
  text: string;
  originals: ContentNode[];
}

const blocks = new Set('address article aside blockquote dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p section table tbody td tfoot th thead tr ul'.split(' '));
const excluded = new Set(['script', 'style', 'code', 'pre', 'noscript', 'svg', 'math']);
export function isOpaqueContent(node: ContentNode): boolean { return excluded.has(node.nodeName.toLowerCase()); }
const name = (node: ContentNode) => node.nodeName.toLowerCase();
const children = (node: ContentNode) => Array.from(node.childNodes || []);
const isText = (node: ContentNode) => node.nodeType === 3 || node.nodeName === '#text';
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function richContentUnits(root: ContentNode): RichContentUnit[] {
  const units: RichContentUnit[] = [];
  const blockCache = new Map<ContentNode, boolean>();
  function containsBlock(node: ContentNode): boolean {
    if (!blockCache.has(node)) blockCache.set(node,
      children(node).some(child => blocks.has(name(child)) || containsBlock(child))
    );
    return blockCache.get(node)!;
  }
  function makeUnit(nodes: ContentNode[]): void {
    const originals: ContentNode[] = [];
    let plainText = '';
    function encode(node: ContentNode): string {
      if (isText(node)) {
        const value = node.nodeValue ?? node.value ?? '';
        plainText += value;
        return escape(value);
      }
      if (name(node).startsWith('#')) return '';
      const index = originals.push(node) - 1;
      return `<span data-i18n-slot="${index}">${excluded.has(name(node)) ? '' : children(node).map(encode).join('')}</span>`;
    }
    const message = nodes.map(encode).join('').replace(/\s+/g, ' ').trim();
    if (plainText.trim()) units.push({ nodes, message, text: plainText, originals });
  }
  function visit(node: ContentNode): void {
    if (excluded.has(name(node))) return;
    let inline: ContentNode[] = [];
    const flush = () => { if (inline.length) makeUnit(inline); inline = []; };
    for (const child of children(node)) {
      if (excluded.has(name(child))) { flush(); continue; }
      if (blocks.has(name(child)) || containsBlock(child)) { flush(); visit(child); }
      else inline.push(child);
    }
    flush();
  }
  visit(root);
  return units;
}

export function richContentAttributes(root: ContentNode): { node: ContentNode; name: string; value: string }[] {
  const result: { node: ContentNode; name: string; value: string }[] = [];
  function visit(node: ContentNode): void {
    if (excluded.has(name(node))) return;
    for (const attribute of ['alt', 'title', 'aria-label', 'aria-description', 'placeholder']) {
      const value = node.getAttribute?.(attribute) ?? node.attrs?.find(item => item.name === attribute)?.value;
      if (value) result.push({ node, name: attribute, value });
    }
    children(node).forEach(visit);
  }
  visit(root);
  return result;
}
