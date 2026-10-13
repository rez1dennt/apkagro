export function formatPhone(value) {
  let digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  if (!digits.startsWith('7')) digits = '7' + digits;
  const national = digits.slice(1, 11);
  return '+7' + (national ? ` (${national.slice(0, 3)}` : '') +
    (national.length >= 3 ? ')' : '') + (national.length > 3 ? ` ${national.slice(3, 6)}` : '') +
    (national.length > 6 ? `-${national.slice(6, 8)}` : '') + (national.length > 8 ? `-${national.slice(8, 10)}` : '');
}

export function formatSnils(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  return digits.slice(0, 3) + (digits.length > 3 ? '-' + digits.slice(3, 6) : '') +
    (digits.length > 6 ? '-' + digits.slice(6, 9) : '') + (digits.length > 9 ? ' ' + digits.slice(9, 11) : '');
}

export function attachMask(input, format) {
  if (!input) return;
  const beforeInput = event => {
    if (event.isComposing || input.selectionStart !== input.selectionEnd) return;
    const backward = event.inputType === 'deleteContentBackward';
    const forward = event.inputType === 'deleteContentForward';
    if (!backward && !forward) return;
    const value = input.value, cursor = input.selectionStart;
    let index = backward ? cursor - 1 : cursor;
    if (index < 0 || index >= value.length || /\d/.test(value[index])) return;
    while (index >= 0 && index < value.length && !/\d/.test(value[index])) index += backward ? -1 : 1;
    if (index < 0 || index >= value.length) return;
    event.preventDefault();
    input.value = value.slice(0, index) + value.slice(index + 1);
    const position = backward ? index : cursor;
    input.setSelectionRange(position, position);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const onInput = event => {
    if (event.isComposing) return;
    const raw = input.value, cursor = input.selectionStart ?? raw.length, atEnd = cursor === raw.length;
    let digitCount = raw.slice(0, cursor).replace(/\D/g, '').length;
    const rawDigits = raw.replace(/\D/g, '');
    const formatted = format(raw);
    if (format === formatPhone && rawDigits && !/^[78]/.test(rawDigits)) digitCount++;
    input.value = formatted;
    let position = 0, seen = 0;
    if (atEnd) position = formatted.length;
    else if (digitCount) {
      for (let index = 0; index < formatted.length; index++) {
        if (/\d/.test(formatted[index])) seen++;
        if (seen >= digitCount) { position = index + 1; break; }
      }
    }
    input.setSelectionRange(position, position);
  };
  input.addEventListener('beforeinput',beforeInput);
  input.addEventListener('input',onInput);
  return ()=>{input.removeEventListener('beforeinput',beforeInput);input.removeEventListener('input',onInput);};
}
