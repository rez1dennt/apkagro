// Typed prose is an explicit path contract shared by editing, validation and output.
// IDs and numeric record indexes both occupy one path segment; stored keys do not change.
const proseFields = [
  [/^programs\.[^.]+\.description$/, 20000],
  [/^programs\.[^.]+\.disclaimer$/, 2000],
  [/^pages\.[^.]+\.intro$/, 5000],
  [/^pages\.[^.]+\.body$/, 100000],
  [/^(?:benefits|steps)\.[^.]+\.body$/, 20000],
  [/^faqs\.[^.]+\.answer$/, 20000],
  [/^extraSections\.[^.]+\.(?:items\.[^.]+\.)?body$/, 20000]
];
export const robotsChoices = [
  ['index,follow', 'Разрешить индексацию и переходы по ссылкам'],
  ['noindex,follow', 'Запретить индексацию, разрешить переходы по ссылкам'],
  ['noindex,nofollow', 'Запретить индексацию и переходы по ссылкам'],
  ['index,nofollow', 'Разрешить индексацию, запретить переходы по ссылкам']
];
export function contentFieldContract(path) {
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const prose = proseFields.find(([pattern]) => pattern.test(normalized));
  return {
    format: prose ? 'markdown' : 'plain',
    maxLength: prose?.[1],
    optionalIcon: /^extraSections\.[^.]+\.items\.[^.]+\.icon$/.test(normalized)
  };
}
export function richTextEntries(content) {
  const entries = [];
  const visit = (value, path) => {
    if (typeof value === 'string') {
      if (contentFieldContract(path).format === 'markdown') entries.push([path, value]);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, path ? path + '.' + key : key);
    }
  };
  visit(content, '');
  return entries;
}
