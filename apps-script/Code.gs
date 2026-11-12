/**
 * متابعة التجارب الحقلية — Backend على Google Apps Script
 * --------------------------------------------------------
 * بيحفظ البيانات في Google Sheet، ويعمل فولدر لكل عميل على Google Drive
 * جواه فولدر لكل زيارة (مترتبين بالاسم)، وملف Google Docs لكل عميل فيه رحلته كاملة بالصور.
 *
 * الإعداد (مرة واحدة):
 *  1) اعمل Google Sheet جديد ← Extensions ← Apps Script ← امسح الكود والصق الملف ده.
 *  2) غيّر TOKEN تحت لكلمة سر خاصة بيك.
 *  3) شغّل الدالة setup مرة واحدة واقبل الصلاحيات.
 *  4) Deploy ← New deployment ← Web app ← Execute as: Me ← Who has access: Anyone ← Deploy.
 *  5) انسخ رابط الـ Web app وحطه هو والـ TOKEN في إعدادات التطبيق.
 */

const TOKEN = 'CHANGE-ME-123';                         // ← غيّره (نفس token في config.js)
const ADMIN_PASSWORD = 'CHANGE-ME-ADMIN';              // ← كلمة سر الأدمن (نفس اللي بتفتح بيها الإعدادات)
const ROOT_FOLDER_NAME = 'متابعة التجارب - ملفات العملاء'; // اسم الفولدر الرئيسي على الدرايف
const MAX_DOC_IMAGES_PER_VISIT = 6;                    // عدد الصور المعروضة داخل ملف Docs لكل زيارة

const CLIENT_COLS = [
  ['id', 'id'], ['code', 'كود العميل'], ['name', 'اسم العميل'], ['phone', 'الموبايل'], ['region', 'المنطقة'], ['area', 'المركز'],
  ['village', 'القرية'], ['directions', 'وصف الوصول'], ['acreage', 'المساحة (فدان)'], ['variety', 'الصنف'], ['plantingDate', 'تاريخ الزراعة'],
  ['irrigation', 'نظام الري'], ['startDate', 'بداية التجربة'], ['lat', 'خط العرض'], ['lng', 'خط الطول'], ['accuracy', 'دقة الموقع (م)'],
  ['mapUrl', 'رابط الموقع'], ['notes', 'ملاحظات'], ['extraText', 'حقول إضافية'], ['folderUrl', 'فولدر الدرايف'], ['docUrl', 'ملف العميل (Docs)'],
  ['createdBy', 'سجّل بواسطة'], ['createdAt', 'تاريخ الإنشاء'], ['updatedAt', 'آخر تعديل'], ['deleted', 'محذوف'],
  ['extra', 'extra_json'], ['locAt', 'وقت الموقع'], ['folderId', 'folderId'], ['docId', 'docId'], ['syncedAt', 'syncedAt']
];
const VISIT_COLS = [
  ['id', 'id'], ['clientId', 'clientId'], ['clientCode', 'كود العميل'], ['clientName', 'اسم العميل'], ['region', 'المنطقة'],
  ['visitKey', 'مفتاح الزيارة'], ['visitName', 'الزيارة'], ['order', 'الترتيب'], ['status', 'الحالة'], ['plannedDate', 'الموعد المخطط'],
  ['date', 'تاريخ التنفيذ'], ['product', 'المنتج'], ['linesTreated', 'عدد الخطوط'], ['rate', 'المعدل'], ['method', 'طريقة التطبيق'],
  ['vigor', 'قوة النمو (1-5)'], ['leafColor', 'لون الأوراق (1-5)'], ['flowers', 'أزهار/نبات'], ['fruits', 'ثمار/نبات'], ['infection', 'إصابة %'],
  ['vsControl', 'مقارنة بالكنترول'], ['farmerRating', 'تقييم العميل (1-5)'], ['purchaseIntent', 'نية الشراء'], ['expectedQty', 'الكمية المتوقعة'],
  ['notes', 'ملاحظات'], ['extraText', 'حقول إضافية'], ['photosCount', 'عدد الصور'], ['lat', 'خط العرض'], ['lng', 'خط الطول'],
  ['accuracy', 'دقة الموقع (م)'], ['mapUrl', 'رابط الموقع'], ['folderUrl', 'فولدر الزيارة'], ['createdBy', 'سجّل بواسطة'],
  ['createdAt', 'تاريخ الإنشاء'], ['updatedAt', 'آخر تعديل'], ['deleted', 'محذوف'], ['extra', 'extra_json'], ['locAt', 'وقت الموقع'],
  ['folderId', 'folderId'], ['syncedAt', 'syncedAt']
];
const PHOTO_COLS = [
  ['id', 'id'], ['visitId', 'visitId'], ['clientId', 'clientId'], ['clientCode', 'كود العميل'], ['visitName', 'الزيارة'],
  ['fileName', 'اسم الملف'], ['fileUrl', 'رابط الصورة'], ['fileId', 'fileId'], ['takenAt', 'وقت التصوير'], ['lat', 'خط العرض'],
  ['lng', 'خط الطول'], ['uploadedAt', 'وقت الرفع']
];
const STATUS_AR = { done: 'تمت', postponed: 'مؤجلة', missed: 'لم تتم' };

// ================= Web endpoints =================
function doGet() { return out_({ ok: true, data: { app: 'field-trials', time: new Date().toISOString() } }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out_({ ok: false, error: 'رمز الربط (TOKEN) غير صحيح' });
    lock.waitLock(30000);
    return out_({ ok: true, data: handle_(req.action, req.payload || {}) });
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  } finally { try { lock.releaseLock(); } catch (x) { } }
}

function handle_(action, p) {
  switch (action) {
    case 'ping': return { sheetName: SpreadsheetApp.getActive().getName(), time: new Date().toISOString() };
    case 'upsertClient': return upsertClient_(p.client, p.templates || []);
    case 'upsertVisit': return upsertVisit_(p.visit);
    case 'uploadPhoto': return uploadPhoto_(p.photo);
    case 'rebuildDocs': (p.clientIds || []).forEach(id => buildDoc_(id)); return { done: (p.clientIds || []).length };
    case 'pull': return pull_(p.since || '');
    case 'getConfig': return getConfig_();
    case 'setConfig': return setConfig_(p.config, p.adminPassword);
    default: throw new Error('عملية غير معروفة: ' + action);
  }
}

// ================= Actions =================
function upsertClient_(c, templates) {
  if (!c || !c.id) throw new Error('بيانات عميل ناقصة');
  const sh = sheet_('العملاء', CLIENT_COLS);
  const old = getObj_(sh, CLIENT_COLS, c.id) || {};
  const rec = Object.assign({}, old, c, {
    folderId: old.folderId || '', folderUrl: old.folderUrl || '', docId: old.docId || '', docUrl: old.docUrl || '',
    extra: JSON.stringify(c.extra || []), extraText: extraText_(c.extra), mapUrl: mapUrl_(c.lat, c.lng),
    deleted: c.deleted ? 1 : 0, syncedAt: new Date().toISOString()
  });
  if (!rec.deleted) {
    const folder = clientFolder_(rec);
    rec.folderId = folder.getId(); rec.folderUrl = folder.getUrl();
    (templates || []).forEach((t, i) => sub_(folder, visitFolderName_({ order: i + 1, visitName: t.name, visitKey: t.key })));
  } else if (rec.folderId) {
    try { const f = DriveApp.getFolderById(rec.folderId); if (f.getName().indexOf('[محذوف] ') !== 0) f.setName('[محذوف] ' + f.getName()); } catch (x) { }
  }
  upsert_(sh, CLIENT_COLS, rec);
  if (!rec.deleted) buildDoc_(rec.id);
  const fresh = getObj_(sh, CLIENT_COLS, rec.id);
  return { folderUrl: fresh.folderUrl, docUrl: fresh.docUrl };
}

function upsertVisit_(v) {
  if (!v || !v.id) throw new Error('بيانات زيارة ناقصة');
  const cs = sheet_('العملاء', CLIENT_COLS); const vs = sheet_('الزيارات', VISIT_COLS);
  const c = getObj_(cs, CLIENT_COLS, v.clientId);
  if (!c) throw new Error('العميل الخاص بالزيارة لم يُرفع بعد');
  const old = getObj_(vs, VISIT_COLS, v.id) || {};
  const rec = Object.assign({}, old, v, {
    clientCode: c.code, clientName: c.name, region: c.region,
    extra: JSON.stringify(v.extra || []), extraText: extraText_(v.extra), mapUrl: mapUrl_(v.lat, v.lng),
    deleted: v.deleted ? 1 : 0, syncedAt: new Date().toISOString()
  });
  if (!rec.deleted) {
    const vf = visitFolder_(c, rec); rec.folderId = vf.getId(); rec.folderUrl = vf.getUrl();
  }
  upsert_(vs, VISIT_COLS, rec);
  buildDoc_(c.id);
  const fresh = getObj_(cs, CLIENT_COLS, c.id);
  return { folderUrl: rec.folderUrl || '', docUrl: fresh.docUrl };
}

function uploadPhoto_(ph) {
  if (!ph || !ph.id || !ph.data) throw new Error('صورة ناقصة');
  const ps = sheet_('الصور', PHOTO_COLS);
  const exist = getObj_(ps, PHOTO_COLS, ph.id);
  if (exist) return { url: exist.fileUrl };
  const vs = sheet_('الزيارات', VISIT_COLS); const cs = sheet_('العملاء', CLIENT_COLS);
  const v = getObj_(vs, VISIT_COLS, ph.visitId); if (!v) throw new Error('الزيارة لم تُرفع بعد');
  const c = getObj_(cs, CLIENT_COLS, v.clientId); if (!c) throw new Error('العميل لم يُرفع بعد');
  const folder = visitFolder_(c, v);
  let n = 1; const it = folder.getFiles(); while (it.hasNext()) { it.next(); n++; }
  const name = safe_(`${c.code}_${v.visitName}_${v.date || ''}_${('0' + n).slice(-2)}.jpg`);
  const blob = Utilities.newBlob(Utilities.base64Decode(ph.data), ph.mime || 'image/jpeg', name);
  const file = folder.createFile(blob);
  file.setDescription(`${c.name} — ${v.visitName}${ph.lat ? ` — ${ph.lat},${ph.lng}` : ''}`);
  upsert_(ps, PHOTO_COLS, {
    id: ph.id, visitId: v.id, clientId: c.id, clientCode: c.code, visitName: v.visitName, fileName: name,
    fileUrl: file.getUrl(), fileId: file.getId(), takenAt: ph.takenAt || '', lat: ph.lat || '', lng: ph.lng || '', uploadedAt: new Date().toISOString()
  });
  // عدد الصور في شيت الزيارات
  const count = readAll_(ps, PHOTO_COLS).filter(x => x.visitId === v.id).length;
  v.photosCount = count; upsert_(vs, VISIT_COLS, v);
  return { url: file.getUrl() };
}

// إعدادات مشتركة لكل الأجهزة (الأدمن بس يقدر يغيرها)
function getConfig_() { const raw = PropertiesService.getScriptProperties().getProperty('APP_CONFIG'); return raw ? JSON.parse(raw) : null; }
function setConfig_(cfg, adminPassword) {
  if (ADMIN_PASSWORD === 'CHANGE-ME-ADMIN' || adminPassword !== ADMIN_PASSWORD) throw new Error('كلمة سر الأدمن غير صحيحة (راجع ADMIN_PASSWORD في Apps Script)');
  const c = Object.assign({}, cfg || {}, { updatedAt: new Date().toISOString() });
  PropertiesService.getScriptProperties().setProperty('APP_CONFIG', JSON.stringify(c));
  return { updatedAt: c.updatedAt };
}

function pull_(since) {
  const serverTime = new Date().toISOString();
  const pick = (rows) => rows.filter(r => !since || String(r.syncedAt) > since).map(r => { const o = Object.assign({}, r); delete o.folderId; delete o.docId; return o; });
  return {
    serverTime,
    config: getConfig_(),
    clients: pick(readAll_(sheet_('العملاء', CLIENT_COLS), CLIENT_COLS)),
    visits: pick(readAll_(sheet_('الزيارات', VISIT_COLS), VISIT_COLS))
  };
}

// ================= Drive =================
function root_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (x) { } }
  const f = DriveApp.createFolder(ROOT_FOLDER_NAME);
  try { // حط الفولدر جنب الشيت
    const parents = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
    if (parents.hasNext()) f.moveTo(parents.next());
  } catch (x) { }
  props.setProperty('ROOT_ID', f.getId());
  return f;
}
function folderName_(c) { return safe_([c.code, c.name, c.village || c.area, c.region].filter(String).join(' - ')); }
function clientFolder_(c) {
  let f = null;
  if (c.folderId) { try { f = DriveApp.getFolderById(c.folderId); if (f.isTrashed()) f = null; } catch (x) { f = null; } }
  const name = folderName_(c);
  if (!f) {
    const regionFolder = c.region ? sub_(root_(), safe_(c.region)) : root_();
    f = regionFolder.createFolder(name);
  } else if (f.getName() !== name) f.setName(name);
  return f;
}
function visitFolderName_(v) {
  if (v.visitKey === 'extra') return safe_(`99 - ${v.visitName || 'زيارة إضافية'} ${v.date || ''}`.trim());
  return safe_(`${('0' + (v.order || 0)).slice(-2)} - ${v.visitName}`);
}
function visitFolder_(c, v) {
  let f = null;
  if (v.folderId) { try { f = DriveApp.getFolderById(v.folderId); if (f.isTrashed()) f = null; } catch (x) { f = null; } }
  if (f) return f;
  return sub_(clientFolder_(c), visitFolderName_(v));
}
function sub_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }

// ================= Docs (ملف العميل) =================
function buildDoc_(clientId) {
  const cs = sheet_('العملاء', CLIENT_COLS);
  const c = getObj_(cs, CLIENT_COLS, clientId);
  if (!c || String(c.deleted) === '1') return;
  const folder = clientFolder_(c);
  const title = 'ملف العميل - ' + folderName_(c);
  let doc = null;
  if (c.docId) { try { doc = DocumentApp.openById(c.docId); } catch (x) { doc = null; } }
  if (!doc) {
    doc = DocumentApp.create(title);
    DriveApp.getFileById(doc.getId()).moveTo(folder);
  } else if (doc.getName() !== title) doc.setName(title);

  const visits = readAll_(sheet_('الزيارات', VISIT_COLS), VISIT_COLS)
    .filter(v => v.clientId === clientId && String(v.deleted) !== '1')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.date).localeCompare(String(b.date)));
  const photos = readAll_(sheet_('الصور', PHOTO_COLS), PHOTO_COLS).filter(p => p.clientId === clientId);

  const body = doc.getBody(); body.clear();
  body.setMarginLeft(40).setMarginRight(40).setMarginTop(40).setMarginBottom(40);
  rtl_(body.getParagraphs()[0].setText(c.name || c.code).setHeading(DocumentApp.ParagraphHeading.TITLE));
  rtl_(body.appendParagraph(`كود: ${c.code}   |   ${[c.region, c.area, c.village].filter(String).join(' - ')}`).setHeading(DocumentApp.ParagraphHeading.SUBTITLE));
  const links = rtl_(body.appendParagraph(''));
  links.appendText('فولدر الدرايف').setLinkUrl(folder.getUrl());
  if (c.mapUrl) { links.appendText('   |   ').setLinkUrl(null); links.appendText('الموقع على الخريطة').setLinkUrl(c.mapUrl); }

  rtl_(body.appendParagraph('بيانات العميل').setHeading(DocumentApp.ParagraphHeading.HEADING1));
  table_(body, [
    ['الموبايل', c.phone], ['المنطقة', c.region], ['المركز', c.area], ['القرية', c.village], ['وصف الوصول', c.directions],
    ['المساحة (فدان)', c.acreage], ['الصنف', c.variety], ['تاريخ الزراعة', c.plantingDate], ['نظام الري', c.irrigation],
    ['بداية التجربة', c.startDate], ['الإحداثيات', c.lat ? `${c.lat}, ${c.lng} (±${c.accuracy}م)` : ''], ['ملاحظات', c.notes],
    ...parseExtra_(c.extra).map(x => [x.k, x.v]), ['سجّل بواسطة', c.createdBy]
  ]);

  rtl_(body.appendParagraph(`رحلة التجربة (${visits.filter(v => v.status === 'done').length} زيارة منفذة)`).setHeading(DocumentApp.ParagraphHeading.HEADING1));
  if (!visits.length) rtl_(body.appendParagraph('لم يتم تسجيل زيارات بعد.'));
  visits.forEach(v => {
    rtl_(body.appendParagraph(`${v.visitName} — ${STATUS_AR[v.status] || v.status} — ${v.date || ''}`).setHeading(DocumentApp.ParagraphHeading.HEADING2));
    table_(body, [
      ['الموعد المخطط', v.plannedDate], ['تاريخ التنفيذ', v.date], ['المنتج', v.product], ['عدد الخطوط', v.linesTreated], ['المعدل', v.rate],
      ['طريقة التطبيق', v.method], ['قوة النمو (1-5)', v.vigor], ['لون الأوراق (1-5)', v.leafColor], ['أزهار/نبات', v.flowers], ['ثمار/نبات', v.fruits],
      ['إصابة %', v.infection], ['مقارنة بالكنترول', v.vsControl], ['تقييم العميل (1-5)', v.farmerRating], ['نية الشراء', v.purchaseIntent],
      ['الكمية المتوقعة', v.expectedQty], ['ملاحظات', v.notes], ...parseExtra_(v.extra).map(x => [x.k, x.v]),
      ['الموقع', v.lat ? `${v.lat}, ${v.lng}` : ''], ['سجّل بواسطة', v.createdBy]
    ]);
    const vp = photos.filter(p => p.visitId === v.id);
    const lp = rtl_(body.appendParagraph(''));
    if (v.folderUrl) lp.appendText(`صور الزيارة (${vp.length}) — فتح الفولدر`).setLinkUrl(v.folderUrl);
    if (vp.length) {
      const imgP = rtl_(body.appendParagraph(''));
      vp.slice(0, MAX_DOC_IMAGES_PER_VISIT).forEach(p => {
        try {
          const img = imgP.appendInlineImage(DriveApp.getFileById(p.fileId).getBlob());
          const w = img.getWidth(), h = img.getHeight(), W = 150; img.setWidth(W).setHeight(Math.round(h * W / w)).setLinkUrl(p.fileUrl);
          imgP.appendText(' ');
        } catch (x) { }
      });
    }
  });
  rtl_(body.appendParagraph(`آخر تحديث: ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')}`)).setItalic(true);
  doc.saveAndClose();
  if (c.docId !== doc.getId() || c.folderId !== folder.getId()) {
    c.docId = doc.getId(); c.docUrl = doc.getUrl(); c.folderId = folder.getId(); c.folderUrl = folder.getUrl(); c.syncedAt = new Date().toISOString();
    upsert_(cs, CLIENT_COLS, c);
  }
}
function table_(body, rows) {
  const data = rows.filter(r => r[1] !== '' && r[1] != null).map(r => [String(r[0]), String(r[1])]);
  if (!data.length) return;
  // الجدول: القيمة على الشمال والعنوان على اليمين (قراءة عربية)
  const t = body.appendTable(data.map(r => [r[1], r[0]]));
  t.setBorderColor('#d4dccf');
  for (let i = 0; i < t.getNumRows(); i++) {
    const row = t.getRow(i);
    row.getCell(1).setBackgroundColor('#eef5ea').setWidth(150);
    for (let j = 0; j < row.getNumCells(); j++) { const cell = row.getCell(j); for (let k = 0; k < cell.getNumChildren(); k++) { const ch = cell.getChild(k); if (ch.getType() === DocumentApp.ElementType.PARAGRAPH) rtl_(ch.asParagraph()); } }
    row.getCell(1).editAsText().setBold(true);
  }
}
function rtl_(p) { try { p.setLeftToRight(false); p.setAlignment(DocumentApp.HorizontalAlignment.RIGHT); } catch (x) { } return p; }

// ================= Sheets helpers =================
function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.setRightToLeft(true); }
  if (sh.getLastRow() === 0) {
    if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // نص — يمنع تحويل التواريخ والأرقام
    sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[1])]).setFontWeight('bold').setBackground('#14532d').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    const internal = ['id', 'clientId', 'extra', 'folderId', 'docId', 'syncedAt', 'fileId', 'visitId', 'visitKey', 'locAt'];
    cols.forEach((c, i) => { if (internal.indexOf(c[0]) >= 0) sh.hideColumns(i + 1); });
  }
  return sh;
}
function findRow_(sh, id) {
  const n = sh.getLastRow(); if (n < 2) return -1;
  const f = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : -1;
}
function val_(x) { if (x === null || x === undefined) return ''; if (typeof x === 'object') return JSON.stringify(x); return String(x); }
function upsert_(sh, cols, obj) {
  const row = cols.map(c => val_(obj[c[0]]));
  const r = findRow_(sh, obj.id);
  if (r > 0) sh.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  else { const nr = sh.getLastRow() + 1; sh.getRange(nr, 1, 1, row.length).setNumberFormat('@').setValues([row]); }
}
function rowToObj_(cols, r) { const o = {}; cols.forEach((c, i) => o[c[0]] = r[i] instanceof Date ? r[i].toISOString() : String(r[i] ?? '')); return o; }
function getObj_(sh, cols, id) { const r = findRow_(sh, id); if (r < 0) return null; return rowToObj_(cols, sh.getRange(r, 1, 1, cols.length).getValues()[0]); }
function readAll_(sh, cols) { const n = sh.getLastRow(); if (n < 2) return []; return sh.getRange(2, 1, n - 1, cols.length).getValues().map(r => rowToObj_(cols, r)).filter(o => o.id); }
function parseExtra_(s) { try { const a = typeof s === 'string' ? JSON.parse(s || '[]') : (s || []); return a.filter(x => x && (x.k || x.v)); } catch (x) { return []; } }
function extraText_(a) { return parseExtra_(a).map(x => `${x.k}: ${x.v}`).join(' | '); }
function mapUrl_(lat, lng) { return lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : ''; }
function safe_(s) { return String(s).replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ================= Setup & menu =================
function setup() {
  sheet_('العملاء', CLIENT_COLS); sheet_('الزيارات', VISIT_COLS); sheet_('الصور', PHOTO_COLS);
  const s1 = SpreadsheetApp.getActive().getSheetByName('Sheet1') || SpreadsheetApp.getActive().getSheetByName('ورقة1');
  if (s1 && s1.getLastRow() === 0 && SpreadsheetApp.getActive().getSheets().length > 1) SpreadsheetApp.getActive().deleteSheet(s1);
  const root = root_();
  Logger.log('تم الإعداد ✓ — فولدر العملاء: ' + root.getUrl());
}
function onOpen() {
  SpreadsheetApp.getUi().createMenu('متابعة التجارب')
    .addItem('فتح فولدر ملفات العملاء', 'menuOpenRoot_')
    .addItem('إعادة بناء كل ملفات العملاء (Docs)', 'menuRebuildAll_')
    .addToUi();
}
function menuOpenRoot_() {
  const url = root_().getUrl();
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(`<p style="font-family:sans-serif"><a href="${url}" target="_blank">فتح فولدر العملاء</a></p>`).setWidth(300).setHeight(80), 'فولدر العملاء');
}
function menuRebuildAll_() {
  readAll_(sheet_('العملاء', CLIENT_COLS), CLIENT_COLS).filter(c => String(c.deleted) !== '1').forEach(c => buildDoc_(c.id));
  SpreadsheetApp.getActive().toast('تم تحديث كل ملفات العملاء ✓');
}
