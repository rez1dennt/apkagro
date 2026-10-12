import ExcelJS from 'exceljs';
import { courses } from '../public/assets/js/courses.js';

const statuses = { new: 'Новая', review: 'На проверке', accepted: 'Подтверждена', rejected: 'Отклонена' };
const education = { professional: 'Среднее профессиональное / высшее', student: 'Студент 4-го курса и старше' };
const dateTime = value => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date).replace(', ', ' ');
};
const birthDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('.') : '';

export function createApplicationsWorkbook(applications, {programs=[]}={}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Кадры в АПК';
  workbook.title = 'Заявки на обучение';
  const sheet = workbook.addWorksheet('Заявки');
  sheet.columns = [
    ['Номер заявки', 'id', 38], ['Дата подачи (МСК)', 'createdAt', 22], ['Статус', 'status', 20],
    ['Программа обучения', 'course', 55], ['Фамилия', 'lastName', 22], ['Имя', 'firstName', 20],
    ['Отчество', 'middleName', 22], ['Дата рождения', 'birthDate', 18], ['Телефон', 'phone', 20],
    ['Электронная почта', 'email', 32], ['СНИЛС', 'snils', 20], ['Уровень образования', 'education', 38],
    ['Версия согласия', 'consentVersion', 20], ['Дата согласия (МСК)', 'consentAt', 22]
  ].map(([header, key, width]) => ({ header, key, width }));
  for (const application of applications) {
    // Plain string cells preserve leading zeroes and never become executable formulas.
    const row = sheet.addRow({
      ...Object.fromEntries(['id', 'lastName', 'firstName', 'middleName', 'phone', 'email', 'snils', 'consentVersion'].map(key => [key, String(application[key] ?? '')])),
      createdAt: dateTime(application.createdAt), consentAt: dateTime(application.consentAt), birthDate: birthDate(application.birthDate),
      status: statuses[application.status] || 'Не указан', course: application.courseSnapshot?.title || programs.find(p=>p.id===application.courseId)?.title || courses[application.courseId]?.title || application.courseId || 'Не указана',
      education: education[application.education] || 'Не указан'
    });
    row.height = 54;
    row.alignment = { vertical: 'middle', wrapText: true };
    row.eachCell(cell => { cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF20351A' } }; cell.numFmt = '@'; });
    if (row.number % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6EE' } }; });
  }
  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF20351A' } }; });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `N${Math.max(1, sheet.rowCount)}` };
  return workbook;
}
