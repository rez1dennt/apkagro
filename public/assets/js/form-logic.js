export function validSnils(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11 || /^0+$/.test(digits)) return false;
  if (Number(digits.slice(0, 9)) <= 1001998) return true;
  let sum = [...digits.slice(0, 9)].reduce((total, n, index) => total + Number(n) * (9 - index), 0);
  sum %= 101;
  if (sum === 100) sum = 0;
  return sum === Number(digits.slice(9));
}

export function savedApplication(status, result) {
  return status === 201 && Boolean(result &&
    typeof result.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id) &&
    typeof result.reference === 'string' && result.reference.length > 0 && result.reference.length <= 100);
}
