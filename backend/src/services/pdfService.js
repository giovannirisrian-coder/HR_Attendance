const PDFDocument = require('pdfkit');

/**
 * Build a consolidated monthly timesheet PDF for all LS under a vendor.
 * @param {object} opts
 * @param {{ name: string, code?: string }} opts.vendor
 * @param {number} opts.month 1-12
 * @param {number} opts.year
 * @param {Array<{ employee_name: string, employee_id: string, attendance_date: string, clock_in_time?: string, clock_out_time?: string, status: string }>} opts.rows
 */
function buildVendorMonthlyTimesheetPdf(opts) {
  const { vendor, month, year, rows } = opts;
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const title = `Berau Coal – Consolidated Monthly Timesheet`;
  const period = `${monthNames[month - 1]} ${year}`;

  doc.fontSize(16).fillColor('#145228').text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#334155').text(`Vendor: ${vendor.name}${vendor.code ? ` (${vendor.code})` : ''}`, { align: 'center' });
  doc.text(period, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(9).fillColor('#64748b').text(`Generated: ${new Date().toISOString()}`, { align: 'right' });
  doc.moveDown(0.5);

  let currentEmp = null;
  for (const r of rows) {
    const key = `${r.employee_id}|${r.employee_name}`;
    if (key !== currentEmp) {
      currentEmp = key;
      doc.moveDown(0.6);
      doc.fontSize(11).fillColor('#0f172a').text(`${r.employee_name} (${r.employee_id})`, { underline: true });
      doc.moveDown(0.25);
      doc.fontSize(8).fillColor('#475569');
      doc.text('Date', 40, doc.y, { continued: true, width: 70 });
      doc.text('Clock In', { continued: true, width: 70 });
      doc.text('Clock Out', { continued: true, width: 70 });
      doc.text('Status', { width: 80 });
      doc.moveDown(0.15);
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.2);
    }
    const d = r.attendance_date instanceof Date ? r.attendance_date.toISOString().slice(0, 10) : String(r.attendance_date).slice(0, 10);
    doc.fontSize(8).fillColor('#334155');
    const y = doc.y;
    doc.text(d, 40, y, { continued: true, width: 70 });
    doc.text(r.clock_in_time || '—', { continued: true, width: 70 });
    doc.text(r.clock_out_time || '—', { continued: true, width: 70 });
    doc.text(String(r.status || ''), { width: 80 });
  }

  if (rows.length === 0) {
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#94a3b8').text('No attendance records for this period.', { align: 'center' });
  }

  doc.end();
  return doc;
}

module.exports = { buildVendorMonthlyTimesheetPdf };
