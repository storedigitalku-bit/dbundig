import PDFDocument from 'pdfkit'

/**
 * Laporan PDF MDUNDIG (murni; font dikirim pemanggil). A4 lanskap, font Ubuntu 400/500,
 * kepala laporan + ringkasan + tabel/kartu, kepala tabel diulang tiap halaman, nomor halaman di kaki.
 */
export interface ReportFonts { regular: Buffer; medium: Buffer }
export interface ReportColumn { header: string; width: number; align?: 'left' | 'right'; status?: boolean; strong?: boolean; muted?: boolean }
export interface ReportStat { label: string; value: string }
export interface ReportMeta { title: string; subtitle?: string; generatedAt: string; stats?: ReportStat[] }
export interface ReportSection { title: string; fields: Array<{ label: string; value: string }> }
export interface ReportCard { title: string; meta: string; status: string; sections: ReportSection[] }

const C = {
  heading: '#101828', body: '#344054', muted: '#667085', faint: '#98A2B3',
  border: '#EAECF0', subtle: '#F9FAFB', brand: '#2563EB', neutralDot: '#98A2B3',
}
const MARGIN = 36
const FOOTER = 28

function makeDoc(fonts: ReportFonts) {
  // `font` menerima Buffer saat runtime (tipe @types/pdfkit hanya mencantumkan string); dengan ini font bawaan
  // Helvetica (berkas .afm) tidak pernah dimuat.
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true, font: fonts.regular as unknown as string, info:{ Producer: 'MDUNDIG', Creator: 'MDUNDIG' } })
  doc.registerFont('regular', fonts.regular)
  doc.registerFont('medium', fonts.medium)
  return doc
}

function finish(doc: PDFKit.PDFDocument, title: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  // Kaki halaman: judul + nomor halaman.
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    // Kaki ditulis di area margin bawah: margin dinolkan agar pdfkit tidak menambah halaman kosong.
    doc.page.margins.bottom = 0
    const y = doc.page.height - MARGIN + 6
    const w = doc.page.width - MARGIN * 2
    doc.save().moveTo(MARGIN, y - 8).lineTo(MARGIN + w, y - 8).lineWidth(0.5).strokeColor(C.border).stroke().restore()
    doc.font('regular').fontSize(8).fillColor(C.faint)
    doc.text(`MDUNDIG · ${title}`, MARGIN, y, { width: w / 2, lineBreak: false })
    doc.text(`Halaman ${i - range.start + 1} dari ${range.count}`, MARGIN + w / 2, y, { width: w / 2, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}

function bottom(doc: PDFKit.PDFDocument) { return doc.page.height - MARGIN - FOOTER }

/** Kepala laporan: merek, waktu dibuat, judul, subjudul, kartu ringkasan. Mengembalikan y berikutnya. */
function drawHeader(doc: PDFKit.PDFDocument, meta: ReportMeta): number {
  const w = doc.page.width - MARGIN * 2
  let y = MARGIN
  // Logo MDUNDIG (sama dengan favicon/komponen AppLogo), digambar vektor 26pt.
  const s = 26 / 32
  doc.save().translate(MARGIN, y - 1).scale(s)
  doc.roundedRect(0, 0, 32, 32, 8).fill(C.brand)
  doc.path('M7.5 22.5V10.5L16 17l8.5-6.5v12Z').lineWidth(2.2).lineJoin('round').strokeColor('#FFFFFF').stroke()
  doc.circle(16, 9.6, 1.7).fill('#FFFFFF')
  doc.restore()
  doc.font('medium').fontSize(10).fillColor(C.heading).text('MDUNDIG', MARGIN + 34, y, { lineBreak: false })
  doc.font('regular').fontSize(8).fillColor(C.muted).text('Manajemen Data Undangan Digital', MARGIN + 34, y + 13, { lineBreak: false })
  doc.font('regular').fontSize(8).fillColor(C.muted).text(`Dibuat ${meta.generatedAt}`, MARGIN, y + 4, { width: w, align: 'right', lineBreak: false })
  y += 34
  doc.font('medium').fontSize(17).fillColor(C.heading).text(meta.title, MARGIN, y, { width: w })
  y = doc.y + 2
  if (meta.subtitle) {
    doc.font('regular').fontSize(9.5).fillColor(C.muted).text(meta.subtitle, MARGIN, y, { width: w })
    y = doc.y
  }
  y += 12
  if (meta.stats?.length) {
    const gap = 10
    const bw = (w - gap * (meta.stats.length - 1)) / meta.stats.length
    meta.stats.forEach((s, i) => {
      const x = MARGIN + i * (bw + gap)
      doc.save().roundedRect(x, y, bw, 46, 6).lineWidth(0.75).strokeColor(C.border).stroke().restore()
      doc.font('regular').fontSize(8).fillColor(C.muted).text(s.label, x + 12, y + 9, { width: bw - 24, lineBreak: false })
      doc.font('medium').fontSize(15).fillColor(C.heading).text(s.value, x + 12, y + 21, { width: bw - 24, lineBreak: false })
    })
    y += 46 + 16
  }
  return y
}

const PAD_X = 6
const PAD_Y = 6

function columnX(columns: ReportColumn[], total: number) {
  const sum = columns.reduce((n, c) => n + c.width, 0)
  let x = MARGIN
  return columns.map((c) => { const w = (c.width / sum) * total; const cx = x; x += w; return { x: cx, w } })
}

function drawTableHead(doc: PDFKit.PDFDocument, columns: ReportColumn[], pos: Array<{ x: number; w: number }>, y: number): number {
  const w = doc.page.width - MARGIN * 2
  doc.save().rect(MARGIN, y, w, 22).fill(C.subtle).restore()
  doc.save().moveTo(MARGIN, y + 22).lineTo(MARGIN + w, y + 22).lineWidth(0.75).strokeColor(C.border).stroke().restore()
  doc.font('medium').fontSize(8).fillColor(C.muted)
  columns.forEach((c, i) => doc.text(c.header, pos[i]!.x + PAD_X, y + 7, { width: pos[i]!.w - PAD_X * 2, align: c.align ?? 'left', lineBreak: false }))
  return y + 22
}

/** Laporan tabel (mis. reservasi). Sel boleh berbaris banyak; baris tidak dipotong antarhalaman. */
export function renderTableReport(fonts: ReportFonts, meta: ReportMeta, columns: ReportColumn[], rows: string[][], emptyText = 'Belum ada data.'): Promise<Buffer> {
  const doc = makeDoc(fonts)
  const w = doc.page.width - MARGIN * 2
  const pos = columnX(columns, w)
  let y = drawHeader(doc, meta)
  y = drawTableHead(doc, columns, pos, y)
  if (!rows.length) {
    doc.font('regular').fontSize(9.5).fillColor(C.muted).text(emptyText, MARGIN, y + 14, { width: w, align: 'center' })
  }
  doc.fontSize(9)
  for (const row of rows) {
    const heights = row.map((cell, i) => {
      doc.font(columns[i]!.strong ? 'medium' : 'regular').fontSize(9)
      return doc.heightOfString(cell || '—', { width: pos[i]!.w - PAD_X * 2 - (columns[i]!.status ? 10 : 0) })
    })
    const h = Math.max(...heights, 11) + PAD_Y * 2
    if (y + h > bottom(doc)) {
      doc.addPage()
      y = drawTableHead(doc, columns, pos, MARGIN)
    }
    row.forEach((cell, i) => {
      const col = columns[i]!
      const p = pos[i]!
      const text = cell || '—'
      if (col.status) {
        const ok = text === 'Terkonfirmasi' || text === 'Selesai' || text === 'Baru' || text === 'Diproses'
        doc.save().circle(p.x + PAD_X + 3, y + PAD_Y + 5.5, 2.5).fill(ok ? C.brand : C.neutralDot).restore()
        doc.font('regular').fontSize(9).fillColor(C.body).text(text, p.x + PAD_X + 10, y + PAD_Y, { width: p.w - PAD_X * 2 - 10 })
      } else {
        doc.font(col.strong ? 'medium' : 'regular').fontSize(9).fillColor(col.strong ? C.heading : col.muted ? C.muted : C.body)
          .text(text, p.x + PAD_X, y + PAD_Y, { width: p.w - PAD_X * 2, align: col.align ?? 'left' })
      }
    })
    y += h
    doc.save().moveTo(MARGIN, y).lineTo(MARGIN + w, y).lineWidth(0.5).strokeColor(C.border).stroke().restore()
  }
  return finish(doc, meta.title)
}

/** Laporan kartu (mis. Order Undangan): satu kartu per data, isi dikelompokkan per bagian dalam 2 kolom. */
export function renderCardReport(fonts: ReportFonts, meta: ReportMeta, cards: ReportCard[], emptyText = 'Belum ada data.'): Promise<Buffer> {
  const doc = makeDoc(fonts)
  const w = doc.page.width - MARGIN * 2
  let y = drawHeader(doc, meta)
  if (!cards.length) {
    doc.font('regular').fontSize(9.5).fillColor(C.muted).text(emptyText, MARGIN, y + 8, { width: w, align: 'center' })
  }
  const colGap = 18
  const colW = (w - 24 - colGap) / 2
  const labelW = 120
  const lineH = (label: string, value: string) => {
    doc.font('regular').fontSize(8.5)
    return Math.max(doc.heightOfString(label, { width: labelW - 8 }), doc.heightOfString(value, { width: colW - labelW })) + 4
  }
  const usable = bottom(doc) - MARGIN
  const headH = 36
  for (const card of cards) {
    // Tinggi tiap bagian (judul + baris), lalu disusun ke 2 kolom (ke kolom yang lebih pendek).
    const blocks = card.sections.map((s) => ({ s, h: 16 + s.fields.reduce((n, f) => n + lineH(f.label, f.value), 0) + 8 }))
    const colsH = [0, 0]
    const placed = blocks.map((b) => { const c = colsH[0]! <= colsH[1]! ? 0 : 1; const top = colsH[c]!; colsH[c] = top + b.h; return { ...b, c, top } })
    const bodyH = Math.max(colsH[0]!, colsH[1]!, 14)
    const cardH = headH + 8 + bodyH
    if (y + Math.min(cardH, headH + 60) > bottom(doc) || (cardH <= usable && y + cardH > bottom(doc))) { doc.addPage(); y = MARGIN }
    // Kepala kartu: judul, keterangan, status.
    doc.save().roundedRect(MARGIN, y, w, headH, 6).fill(C.subtle).restore()
    doc.font('medium').fontSize(10.5).fillColor(C.heading).text(card.title, MARGIN + 12, y + 7, { width: w - 140, lineBreak: false, ellipsis: true })
    doc.font('regular').fontSize(8).fillColor(C.muted).text(card.meta, MARGIN + 12, y + 21, { width: w - 140, lineBreak: false, ellipsis: true })
    doc.save().circle(MARGIN + w - 92, y + 18, 2.5).fill(card.status === 'Batal' ? C.neutralDot : C.brand).restore()
    doc.font('regular').fontSize(9).fillColor(C.body).text(card.status, MARGIN + w - 86, y + 12.5, { width: 74, lineBreak: false })
    const bodyTop = y + headH + 8
    if (!card.sections.length) {
      doc.font('regular').fontSize(8.5).fillColor(C.muted).text('Belum ada isian.', MARGIN + 12, bodyTop, { width: w - 24 })
      y = bodyTop + 14 + 16
      continue
    }
    const drawField = (x: number, yy: number, f: { label: string; value: string }) => {
      doc.font('regular').fontSize(8.5).fillColor(C.muted).text(f.label, x, yy, { width: labelW - 8 })
      doc.font('regular').fontSize(8.5).fillColor(C.heading).text(f.value, x + labelW, yy, { width: colW - labelW })
    }
    const drawTitle = (x: number, yy: number, t: string) =>
      doc.font('medium').fontSize(8.5).fillColor(C.brand).text(t.toUpperCase(), x, yy, { width: colW, lineBreak: false, characterSpacing: 0.4 })
    if (cardH <= usable) {
      for (const b of placed) {
        const x = MARGIN + 12 + b.c * (colW + colGap)
        let yy = bodyTop + b.top
        drawTitle(x, yy, b.s.title)
        yy += 16
        for (const f of b.s.fields) { drawField(x, yy, f); yy += lineH(f.label, f.value) }
      }
      y = bodyTop + bodyH + 16
    } else {
      // Kartu lebih tinggi dari satu halaman: satu kolom mengalir antarhalaman.
      let yy = bodyTop
      const x = MARGIN + 12
      for (const b of blocks) {
        if (yy + 32 > bottom(doc)) { doc.addPage(); yy = MARGIN }
        drawTitle(x, yy, b.s.title)
        yy += 16
        for (const f of b.s.fields) {
          const h = lineH(f.label, f.value)
          if (yy + h > bottom(doc)) { doc.addPage(); yy = MARGIN }
          drawField(x, yy, f)
          yy += h
        }
        yy += 8
      }
      y = yy + 16
    }
  }
  return finish(doc, meta.title)
}
