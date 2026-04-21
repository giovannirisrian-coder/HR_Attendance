const PDFDocument = require('pdfkit');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const C = {
  brand: '#0d3320',
  brandMid: '#145228',
  accent: '#1e8240',
  ink: '#0f172a',
  muted: '#475569',
  light: '#64748b',
  border: '#cbd5e1',
  headerBg: '#ecfdf5',
  rowAlt: '#f8fafc',
};

const PAGE = { w: 595.28, h: 841.89, margin: 48, bottomReserve: 56 };
const usableW = () => PAGE.w - PAGE.margin * 2;

function timeToMins(t) {
  if (t == null || t === '') return null;
  const s = String(t).slice(0, 8);
  const parts = s.split(':').map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1];
}

function formatDurationMins(mins) {
  if (mins == null || mins < 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function rowWorkingMins(clockIn, clockOut) {
  const a = timeToMins(clockIn);
  const b = timeToMins(clockOut);
  if (a == null || b == null) return null;
  const d = b - a;
  return d >= 0 ? d : null;
}

function formatDateOnly(raw) {
  if (!raw) return '—';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function formatDayShort(raw) {
  if (!raw) return '';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function aggregateByEmployee(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.employee_id}|${r.employee_name}`;
    if (!map.has(key)) {
      map.set(key, {
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        rows: [],
        approved: 0,
        pending: 0,
        rejected: 0,
        totalMins: 0,
        total_present_days: 0,
        leave_cuti: Number(r.leave_cuti) || 0,
        leave_izin: Number(r.leave_izin) || 0,
        leave_sakit: Number(r.leave_sakit) || 0,
      });
    }
    const g = map.get(key);
    g.rows.push(r);
    const st = String(r.status || '').toLowerCase();
    if (st === 'approved') g.approved++;
    else if (st === 'pending') g.pending++;
    else if (st === 'rejected') g.rejected++;
    if (r.clock_in_time != null) g.total_present_days++;
    const mins = rowWorkingMins(r.clock_in_time, r.clock_out_time);
    if (mins != null && st === 'approved') g.totalMins += mins;
  }
  for (const g of map.values()) {
    g.rows.sort((a, b) => {
      const da = new Date(a.attendance_date).getTime();
      const db = new Date(b.attendance_date).getTime();
      return da - db;
    });
  }
  return Array.from(map.values());
}

/** @returns {number} next Y below table */
function drawAttendanceSummaryTable(doc, yStart, groups) {
  const x0 = PAGE.margin;
  const w = usableW();
  let y = yStart;
  const maxY = PAGE.h - PAGE.bottomReserve;
  const rowH = 18;
  const colW = {
    name: Math.max(220, w - (70 * 4)),
    total: 70,
    cuti: 70,
    sakit: 70,
    izin: 70,
  };
  const tableW = colW.name + colW.total + colW.cuti + colW.sakit + colW.izin;

  const drawHeader = (headerY) => {
    doc.save();
    doc.rect(x0, headerY, tableW, rowH).fill(C.headerBg);
    doc.restore();
    doc.rect(x0, headerY, tableW, rowH).strokeColor(C.border).lineWidth(0.55).stroke();

    let x = x0 + 6;
    const ty = headerY + 5;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.brandMid);
    doc.text('Name', x, ty, { width: colW.name - 8 });
    x += colW.name;
    doc.text('Masuk', x, ty, { width: colW.total - 8, align: 'center' });
    x += colW.total;
    doc.text('Cuti', x, ty, { width: colW.cuti - 8, align: 'center' });
    x += colW.cuti;
    doc.text('Sakit', x, ty, { width: colW.sakit - 8, align: 'center' });
    x += colW.sakit;
    doc.text('Izin', x, ty, { width: colW.izin - 8, align: 'center' });
  };

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink);
  doc.text('Attendance summary by LS', x0, y);
  y += 14;

  if (y + rowH > maxY) {
    doc.addPage();
    doc.x = PAGE.margin;
    doc.y = PAGE.margin;
    y = doc.y;
  }
  drawHeader(y);
  y += rowH;

  groups.forEach((g, idx) => {
    if (y + rowH > maxY) {
      doc.addPage();
      doc.x = PAGE.margin;
      doc.y = PAGE.margin;
      y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.brandMid);
      doc.text('Attendance summary by LS (continued)', x0, y);
      y += 14;
      drawHeader(y);
      y += rowH;
    }

    if (idx % 2 === 1) {
      doc.save();
      doc.rect(x0, y, tableW, rowH).fill(C.rowAlt);
      doc.restore();
    }
    doc.rect(x0, y, tableW, rowH).strokeColor(C.border).lineWidth(0.35).stroke();

    let x = x0 + 6;
    const ty = y + 5;
    doc.font('Helvetica').fontSize(8).fillColor(C.ink);
    doc.text(g.employee_name || '—', x, ty, { width: colW.name - 8 });
    x += colW.name;
    doc.text(String(g.total_present_days || 0), x, ty, { width: colW.total - 8, align: 'center' });
    x += colW.total;
    doc.text(String(g.leave_cuti || 0), x, ty, { width: colW.cuti - 8, align: 'center' });
    x += colW.cuti;
    doc.text(String(g.leave_sakit || 0), x, ty, { width: colW.sakit - 8, align: 'center' });
    x += colW.sakit;
    doc.text(String(g.leave_izin || 0), x, ty, { width: colW.izin - 8, align: 'center' });
    y += rowH;
  });

  return y + 10;
}

/** @returns {number} next Y below header */
function drawBrandHeader(doc, vendor, month, year) {
  const x0 = PAGE.margin;
  const w = usableW();
  let y = PAGE.margin;

  doc.save();
  doc.rect(x0, y, w, 5).fill(C.brand);
  doc.restore();
  y += 14;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.brandMid);
  doc.text('Berau Coal', x0, y, { width: w, align: 'center' });
  y += 20;
  doc.font('Helvetica').fontSize(9).fillColor(C.muted);
  doc.text('Digital Attendance, Approval & Reporting System', x0, y, { width: w, align: 'center' });
  y += 22;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink);
  doc.text('Consolidated Monthly Timesheet', x0, y, { width: w, align: 'center' });
  y += 16;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.accent);
  doc.text(`${MONTH_NAMES[month - 1]} ${year}`, x0, y, { width: w, align: 'center' });
  y += 22;

  const boxH = 50;
  doc.roundedRect(x0, y, w, boxH, 3).lineWidth(0.7).strokeColor(C.border).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.muted);
  doc.text('Vendor name', x0 + 12, y + 8);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink);
  doc.text(vendor?.name || '—', x0 + 12, y + 20, { width: w / 2 - 20 });
  doc.font('Helvetica').fontSize(8).fillColor(C.muted);
  doc.text('Vendor code', x0 + w / 2 + 6, y + 8);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink);
  doc.text(vendor?.code || '—', x0 + w / 2 + 6, y + 20, { width: w / 2 - 18 });
  doc.font('Helvetica').fontSize(7.5).fillColor(C.light);
  doc.text(
    `Generated: ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`,
    x0 + 12,
    y + 36,
    { width: w - 24 }
  );

  return y + boxH + 14;
}

/** @returns {number} next Y below panel */
function drawSummaryPanel(doc, yStart, groups, rows) {
  const x0 = PAGE.margin;
  const w = usableW();
  let y = yStart;

  const totalRows = rows.length;
  const empCount = groups.length;
  let appr = 0;
  let pend = 0;
  let rej = 0;
  for (const r of rows) {
    const st = String(r.status || '').toLowerCase();
    if (st === 'approved') appr++;
    else if (st === 'pending') pend++;
    else if (st === 'rejected') rej++;
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink);
  doc.text('Period summary', x0, y);
  y += 14;

  const panelH = 42;
  doc.save();
  doc.roundedRect(x0, y, w, panelH, 3);
  doc.fill(C.headerBg);
  doc.strokeColor(C.border).lineWidth(0.7).stroke();
  doc.restore();

  const labels = [
    ['LS employees', String(empCount)],
    ['Attendance lines', String(totalRows)],
    ['Approved', String(appr)],
    ['Pending', String(pend)],
    ['Rejected', String(rej)],
  ];
  const cellW = (w - 24) / 5;
  let cx = x0 + 12;
  const textY = y + 10;
  for (const [label, val] of labels) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
    doc.text(label, cx, textY, { width: cellW - 6, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.brandMid);
    doc.text(val, cx, textY + 12, { width: cellW - 6 });
    cx += cellW;
  }

  return y + panelH + 10;
}

function ensureSpace(doc, needed) {
  const maxY = PAGE.h - PAGE.bottomReserve;
  if (doc.y + needed > maxY) {
    doc.addPage();
    doc.x = PAGE.margin;
    doc.y = PAGE.margin;
    doc.font('Helvetica').fontSize(8).fillColor(C.light);
    doc.text('Consolidated Monthly Timesheet (continued)', PAGE.margin, PAGE.margin, {
      width: usableW(),
      align: 'right',
    });
    doc.moveDown(1.4);
  }
}

function tableTotalWidth(colW) {
  return colW.date + colW.day + colW.in + colW.out + colW.hours + colW.status;
}

function drawTableHeader(doc, x0, y, colW) {
  const tw = tableTotalWidth(colW);
  const h = 20;
  doc.save();
  doc.rect(x0, y, tw, h).fill(C.headerBg);
  doc.restore();
  doc.rect(x0, y, tw, h).strokeColor(C.border).lineWidth(0.55).stroke();

  let x = x0 + 6;
  const ty = y + 6;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.brandMid);
  doc.text('Date', x, ty, { width: colW.date - 8 });
  x += colW.date;
  doc.text('Day', x, ty, { width: colW.day - 4 });
  x += colW.day;
  doc.text('Clock in', x, ty, { width: colW.in - 4 });
  x += colW.in;
  doc.text('Clock out', x, ty, { width: colW.out - 4 });
  x += colW.out;
  doc.text('Duration', x, ty, { width: colW.hours - 4 });
  x += colW.hours;
  doc.text('Status', x, ty, { width: colW.status - 8 });
  return h;
}

function drawDataRow(doc, x0, y, colW, r, alt) {
  const tw = tableTotalWidth(colW);
  const h = 19;
  if (alt) {
    doc.save();
    doc.rect(x0, y, tw, h).fill(C.rowAlt);
    doc.restore();
  }
  doc.rect(x0, y, tw, h).strokeColor(C.border).lineWidth(0.35).stroke();

  const st = String(r.status || '');
  const stLower = st.toLowerCase();
  const mins = rowWorkingMins(r.clock_in_time, r.clock_out_time);
  const dur =
    mins != null ? formatDurationMins(mins) : '—';

  let x = x0 + 6;
  const ty = y + 5;
  doc.font('Helvetica').fontSize(8.5).fillColor(C.ink);
  doc.text(formatDateOnly(r.attendance_date), x, ty, { width: colW.date - 8 });
  x += colW.date;
  doc.fillColor(C.muted).fontSize(8);
  doc.text(formatDayShort(r.attendance_date), x, ty, { width: colW.day - 4 });
  x += colW.day;
  doc.fillColor(C.ink).fontSize(8.5);
  doc.text(r.clock_in_time ? String(r.clock_in_time).slice(0, 8) : '—', x, ty, { width: colW.in - 4 });
  x += colW.in;
  doc.text(r.clock_out_time ? String(r.clock_out_time).slice(0, 8) : '—', x, ty, { width: colW.out - 4 });
  x += colW.out;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted);
  doc.text(dur, x, ty, { width: colW.hours - 4 });
  x += colW.hours;
  doc.font('Helvetica-Bold').fontSize(7);
  if (stLower === 'approved') doc.fillColor(C.accent);
  else if (stLower === 'pending') doc.fillColor('#b45309');
  else if (stLower === 'rejected') doc.fillColor('#b91c1c');
  else doc.fillColor(C.muted);
  doc.text(st ? st.toUpperCase() : '—', x, ty, { width: colW.status - 8 });
  return h;
}

function drawEmployeeFooter(doc, x0, y, w, g) {
  const h = 26;
  doc.save();
  doc.roundedRect(x0, y, w, h, 2);
  doc.fill('#f1f5f9');
  doc.strokeColor(C.border).lineWidth(0.5).stroke();
  doc.restore();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted);
  const line = `Subtotal — Rows: ${g.rows.length}  ·  Approved: ${g.approved}  ·  Pending: ${g.pending}  ·  Rejected: ${g.rejected}  ·  Sum of approved working time: ${formatDurationMins(g.totalMins)}`;
  doc.text(line, x0 + 10, y + 8, { width: w - 20 });
  return h;
}

function finishPdf(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(7).fillColor(C.light);
    doc.text(
      `Berau Coal · Confidential · Page ${i + 1} of ${range.count}`,
      PAGE.margin,
      PAGE.h - 28,
      { width: usableW(), align: 'center' }
    );
  }
}

/**
 * Build a consolidated monthly timesheet PDF for all LS under a vendor.
 */
function buildVendorMonthlyTimesheetPdf(opts) {
  const { vendor, month, year, rows } = opts;
  const m = Math.min(12, Math.max(1, parseInt(month, 10) || 1));
  const reportYear = parseInt(year, 10) || new Date().getFullYear();

  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: `Berau Coal — Timesheet ${MONTH_NAMES[m - 1]} ${reportYear}`,
      Author: 'Berau Coal DAARS',
      Subject: 'Consolidated monthly attendance',
    },
  });

  const colW = {
    date: 78,
    day: 36,
    in: 68,
    out: 68,
    hours: 54,
    status: Math.max(72, usableW() - 78 - 36 - 68 - 68 - 54),
  };

  const headerBottom = drawBrandHeader(doc, vendor, m, reportYear);
  doc.x = PAGE.margin;
  doc.y = headerBottom;

  if (!rows || rows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(C.light);
    doc.text('No attendance records for this vendor and period.', PAGE.margin, doc.y, {
      width: usableW(),
      align: 'center',
    });
    finishPdf(doc);
    return doc;
  }

  const groups = aggregateByEmployee(rows);
  doc.y = drawSummaryPanel(doc, doc.y, groups, rows);
  doc.y = drawAttendanceSummaryTable(doc, doc.y, groups);
  doc.moveDown(0.25);

  const x0 = PAGE.margin;
  const tw = usableW();

  for (const g of groups) {
    const est = 30 + 20 + g.rows.length * 20 + 30;
    ensureSpace(doc, est);

    const bandY = doc.y;
    doc.save();
    doc.rect(x0, bandY, tw, 20).fill(C.brandMid);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff');
    doc.text(g.employee_name, x0 + 10, bandY + 5, { width: tw * 0.62 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#d1fae5');
    doc.text(`Employee ID: ${g.employee_id}`, x0 + tw * 0.52, bandY + 6, { width: tw * 0.46 - 10, align: 'right' });
    doc.y = bandY + 26;

    let ry = doc.y;
    ry += drawTableHeader(doc, x0, ry, colW);

    g.rows.forEach((r, idx) => {
      if (ry + 28 > PAGE.h - PAGE.bottomReserve) {
        doc.addPage();
        doc.x = PAGE.margin;
        doc.y = PAGE.margin;
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.brandMid);
        doc.text(`${g.employee_name} (${g.employee_id}) — continued`, PAGE.margin, PAGE.margin);
        doc.y += 18;
        ry = doc.y;
        ry += drawTableHeader(doc, x0, ry, colW);
      }
      ry += drawDataRow(doc, x0, ry, colW, r, idx % 2 === 1);
    });

    ry += drawEmployeeFooter(doc, x0, ry, tw, g);
    doc.y = ry + 14;
  }

  ensureSpace(doc, 36);
  doc.font('Helvetica').fontSize(7.5).fillColor(C.light);
  doc.text(
    'System-generated consolidation of attendance for the stated period. Official payroll and disputes are governed by HR records and policy.',
    PAGE.margin,
    doc.y,
    { width: usableW(), align: 'justify', lineGap: 2 }
  );

  finishPdf(doc);
  return doc;
}

module.exports = { buildVendorMonthlyTimesheetPdf };
