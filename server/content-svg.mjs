import {SaxesParser} from 'saxes';
import {HttpError} from './intake.mjs';

const namespace = 'http://www.w3.org/2000/svg';
const geometry = {
 svg: ['width', 'height', 'viewBox', 'preserveAspectRatio'],
 g: [], path: ['d'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
 circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'],
 line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'], polygon: ['points']
};
const common = new Set([
 'fill', 'stroke', 'color', 'opacity', 'fill-opacity', 'stroke-opacity',
 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'fill-rule', 'transform'
]);
const numberPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const fail = detail => {
 throw new HttpError(400, 'Неподдерживаемый статический SVG: ' + detail +
  '. Используйте контуры и простую геометрию без текста, CSS, ссылок и эффектов.', 'INVALID_MEDIA');
};
const escape = value => value.replace(/[&"<>]/g, c => ({'&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'}[c]));

function number(value, {positive = false, unit = false, max = 8192} = {}) {
 const source = unit ? value.replace(/px$/, '') : value;
 if (source.length > 32 || !numberPattern.test(source)) fail('неверное число');
 const result = Number(source);
 if (!Number.isFinite(result) || Math.abs(result) > max || result !== 0 && Math.abs(result) < 1e-6 || positive && result < 0) {
  fail('число вне допустимого диапазона');
 }
 return result;
}

function numbers(value) {
 if (value.length > 65536 || !/^[\s,+.\deE-]+$/.test(value)) fail('неверные координаты');
 const values = value.trim().split(/[\s,]+/);
 if (!values.length || values.length > 8192) fail('слишком много координат');
 return values.map(v => number(v));
}

function pathData(value) {
 if (value.length > 65536) fail('слишком длинный контур');
 const tokenPattern = /[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
 const tokens = value.match(tokenPattern) || [];
 if (value.replace(tokenPattern, '').replace(/[\s,]/g, '') || tokens.length > 8192) fail('неверный контур');
 const arity = {m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0};
 let index = 0, command = null, first = true;
 while (index < tokens.length) {
  if (/^[a-z]$/i.test(tokens[index])) {
   command = tokens[index++];
   if (!Object.hasOwn(arity, command.toLowerCase()) || first && command.toLowerCase() !== 'm') {
    fail('неверная команда контура');
   }
   first = false;
   if (command.toLowerCase() === 'z') { command = null; continue; }
  }
  if (!command) fail('неверная последовательность контура');
  const count = arity[command.toLowerCase()];
  if (index + count > tokens.length) fail('неполный контур');
  const args = tokens.slice(index, index + count).map(v => number(v));
  if (command.toLowerCase() === 'a' && (args[0] < 0 || args[1] < 0 ||
   ![0, 1].includes(args[3]) || ![0, 1].includes(args[4]))) fail('неверная дуга');
  index += count;
 }
 if (first) fail('пустой контур');
}

const identity = [1, 0, 0, 1, 0, 0];
function multiply(a, b) {
 const matrix = [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
 ];
 if (matrix.some((n, i) => !Number.isFinite(n) || Math.abs(n) > (i < 4 ? 64 : 8192))) {
  fail('совокупное преобразование вне диапазона');
 }
 return matrix;
}

function transform(value) {
 if (value.length > 2048) fail('слишком длинное преобразование');
 let count = 0, matrix = identity;
 const rest = value.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/g, (_, kind, args) => {
  const values = numbers(args);
  const allowed = {matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1]}[kind];
  if (++count > 16 || !allowed.includes(values.length) ||
   values.some(n => Math.abs(n) > (kind === 'scale' ? 64 : 2048))) fail('неверное преобразование');
  let part = identity;
  const [a, b, c] = values;
  if (kind === 'matrix') part = values;
  else if (kind === 'translate') part = [1, 0, 0, 1, a, b ?? 0];
  else if (kind === 'scale') part = [a, 0, 0, b ?? a, 0, 0];
  else {
   const radians = a * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
   if (kind === 'rotate') {
    part = [cos, sin, -sin, cos, 0, 0];
    if (values.length === 3) part = multiply(multiply([1, 0, 0, 1, b, c], part), [1, 0, 0, 1, -b, -c]);
   } else {
    if (Math.abs(cos) < .01) fail('неограниченное преобразование');
    part = kind === 'skewX' ? [1, 0, Math.tan(radians), 1, 0, 0] : [1, Math.tan(radians), 0, 1, 0, 0];
   }
  }
  matrix = multiply(matrix, part);
  return '';
 });
 if (!count || rest.replace(/[\s,]/g, '')) fail('неверное преобразование');
 return matrix;
}

// Parse and reconstruct a small static subset. Sharp receives only these bytes,
// never the uploaded XML. Element, depth, byte, coordinate and combined-transform
// budgets are checked before returning, including nested groups.
export function prepareStaticSvg(data) {
 if (!Buffer.isBuffer(data) || !data.length || data.length > 2 * 1024 * 1024) {
  fail('размер должен быть не больше 2 МиБ');
 }
 let source;
 try { source = new TextDecoder('utf-8', {fatal: true}).decode(data); }
 catch { fail('требуется XML UTF-8'); }
 const parser = new SaxesParser({xmlns: true}), stack = [], output = [], matrices = [];
 let count = 0, total = 0, root = null, numericBudget = 0;
 parser.on('error', () => fail('некорректный XML'));
 parser.on('doctype', () => fail('DTD запрещён'));
 parser.on('processinginstruction', () => fail('инструкции XML запрещены'));
 parser.on('cdata', () => fail('CDATA запрещён'));
 parser.on('text', text => { if (text.trim()) fail('текст запрещён'); });
 parser.on('opentag', tag => {
  if (++count > 2048 || stack.length >= 32) fail('слишком сложная геометрия');
  if (tag.uri !== namespace || tag.prefix || !Object.hasOwn(geometry, tag.local) || tag.local === 'svg' && stack.length) {
   fail('элемент ' + tag.local + ' не поддерживается');
  }
  if (!stack.length && tag.local !== 'svg') fail('нужен корень svg');
  const attrs = {};
  for (const attr of Object.values(tag.attributes)) {
   if (attr.name === 'xmlns' && attr.value === namespace) continue;
   if (attr.uri || attr.prefix || !common.has(attr.local) && !geometry[tag.local].includes(attr.local)) {
    fail('атрибут ' + attr.name + ' не поддерживается');
   }
   const key = attr.local, value = attr.value;
   if ((total += value.length) > 262144 || value.length > 65536) fail('слишком много геометрии');
   if (['fill', 'stroke', 'color'].includes(key)) {
    if (!/^(?:none|currentColor|transparent|black|white|red|green|blue|#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8})$/i.test(value)) {
     fail('цвет не поддерживается');
    }
    attrs[key] = value === 'currentColor' ? '#000000' : value;
    continue;
   }
   if (key === 'd') pathData(value);
   else if (key === 'points') {
    const points = numbers(value);
    if (points.length < 4 || points.length % 2) fail('неверные точки');
   } else if (key === 'viewBox') {
    const box = numbers(value);
    if (box.length !== 4 || box.some(n => Math.abs(n) > 2048) || box[2] <= 0 || box[3] <= 0) {
     fail('viewBox превышает 2048');
    }
   } else if (key === 'preserveAspectRatio') {
    if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value)) fail('неверный preserveAspectRatio');
   } else if (key === 'transform') transform(value);
   else if (['stroke-linecap', 'stroke-linejoin', 'fill-rule'].includes(key)) {
    const choices = {'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel'], 'fill-rule': ['nonzero', 'evenodd']};
    if (!choices[key].includes(value)) fail('неверное оформление');
   } else {
    const positive = ['width', 'height', 'r', 'rx', 'ry', 'stroke-width', 'stroke-miterlimit'].includes(key);
    const max = key.includes('opacity') ? 1 : tag.local === 'svg' && ['width', 'height'].includes(key) ? 2048 : 8192;
    const n = number(value, {positive: positive || key.includes('opacity'), unit: ['width', 'height'].includes(key), max});
    if (tag.local === 'svg' && ['width', 'height'].includes(key) && n <= 0) fail('пустой размер');
   }
   numericBudget += (value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || []).length;
   if (numericBudget > 16384) fail('слишком много чисел');
   attrs[key] = value;
  }
  if (!stack.length) {
   if (!attrs.viewBox && (!attrs.width || !attrs.height)) fail('задайте viewBox или ширину и высоту');
   if (!attrs.width) attrs.width = String(numbers(attrs.viewBox)[2]);
   if (!attrs.height) attrs.height = String(numbers(attrs.viewBox)[3]);
   if (attrs.viewBox) {
    const box = numbers(attrs.viewBox);
    const width = number(attrs.width, {unit: true, max: 2048});
    const height = number(attrs.height, {unit: true, max: 2048});
    if (width / box[2] > 64 || height / box[3] > 64) fail('масштаб viewBox превышает 64');
   }
   root = attrs;
   attrs.xmlns = namespace;
   attrs.color = '#000000';
  }
  matrices.push(multiply(matrices.at(-1) || identity, attrs.transform ? transform(attrs.transform) : identity));
  output.push('<' + tag.local + Object.entries(attrs).map(([key, value]) => ' ' + key + '="' + escape(value) + '"').join('') + '>');
  stack.push(tag.local);
 });
 parser.on('closetag', () => {
  matrices.pop();
  output.push('</' + stack.pop() + '>');
 });
 try { parser.write(source).close(); }
 catch (error) { if (error instanceof HttpError) throw error; fail('некорректный XML'); }
 if (!root || stack.length) fail('некорректный XML');
 return Buffer.from(output.join(''));
}
