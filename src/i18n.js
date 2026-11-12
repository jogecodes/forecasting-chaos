import { messages } from './locales/messages.js';
import { dynamicMessages } from './locales/dynamic.js';

export const languages = ['es', 'en', 'fr'];
export const catalog = { ...messages, ...dynamicMessages };
export const defaultLanguage = 'en';
let language = defaultLanguage;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const modelPattern = '(?:Polynomial dynamics|Transformer|GRU|Residual MLP|MLP|POLYNOMIAL DYNAMICS|TRANSFORMER|RESIDUAL MLP)';
// Match complete messages, never fragments. More specific templates take priority.
const templates = Object.entries(catalog).filter(([key]) => /\{\w+\}/.test(key)).map(([source, values]) => {
  const names = [], parts = source.split(/(\{\w+\})/);
  const pattern = parts.map(part => {
    if (!/^\{\w+\}$/.test(part)) return escape(part);
    const name = part.slice(1, -1);names.push(name);
    return `(${name === 'model' ? modelPattern : name === 'number' ? '\\d+' : '[\\s\\S]+?'})`;
  }).join('');
  return { source, values, names, regex: new RegExp(`^${pattern}$`), specificity: source.replace(/\{\w+\}/g, '').length };
}).sort((a, b) => b.specificity - a.specificity);

export function translate(source, target = language, depth = 0) {
  if (target === 'en' || !languages.includes(target) || typeof source !== 'string') return source;
  const exact = catalog[source]?.[target];
  if (exact) return exact;
  if (depth > 5) return source;
  for (const template of templates) {
    const match = source.match(template.regex);
    if (!match) continue;
    const values = Object.fromEntries(template.names.map((name, index) => [name, translate(match[index + 1], target, depth + 1)]));
    return template.values[target].replace(/\{(\w+)\}/g, (_, key) => values[key]);
  }
  return source;
}

export function currentLanguage() { return language; }

export function initLocalization() {
  const textSources = new WeakMap(), attributeSources = new WeakMap();
  const attributes = ['aria-label', 'aria-valuetext', 'title', 'alt', 'placeholder'];
  const excluded = element => element?.closest('script, style, math, [data-no-translate]');
  function localizeText(node) {
    if (!node.parentElement || excluded(node.parentElement)) return;
    const raw = node.data, previous = textSources.get(node);
    const source = previous && raw === previous.output ? previous.source : raw;
    const core = source.trim();
    if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return;
    const start = source.indexOf(core);
    const output = source.slice(0, start) + translate(core) + source.slice(start + core.length);
    textSources.set(node, { source, output });
    if (raw !== output) node.data = output;
  }
  function localizeAttributes(element) {
    if (excluded(element)) return;
    const values = attributeSources.get(element) || {};
    const names = element.matches('meta[name="description"]') ? [...attributes, 'content'] : attributes;
    for (const name of names) {
      if (!element.hasAttribute(name)) continue;
      const raw = element.getAttribute(name), previous = values[name];
      const source = previous && raw === previous.output ? previous.source : raw;
      const output = translate(source);
      values[name] = { source, output };
      if (raw !== output) element.setAttribute(name, output);
    }
    attributeSources.set(element, values);
  }
  function localizeTree(root) {
    if (root.nodeType === Node.TEXT_NODE) { localizeText(root);return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    localizeAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      node.nodeType === Node.TEXT_NODE ? localizeText(node) : localizeAttributes(node);
    }
  }
  function setLanguage(next) {
    if (!languages.includes(next)) return;
    language = next;
    document.documentElement.lang = next;
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === next));
    });
    localizeTree(document.documentElement);
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language: next } }));
  }
  // Every visit starts in English, regardless of browser or past selections.
  setLanguage(defaultLanguage);
  document.querySelectorAll('[data-language]').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  // Saved English messages remain the source of truth. Observe replacements from
  // playback/load handlers without replacing elements or touching control values.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') localizeText(record.target);
      else if (record.type === 'attributes') localizeAttributes(record.target);
      else for (const node of record.addedNodes) localizeTree(node);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...attributes, 'content'] });
  return { setLanguage, disconnect: () => observer.disconnect() };
}
