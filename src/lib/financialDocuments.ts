import type { Invoice, Payment } from '@/db/types'
import { dateFromTimestamp } from '@/lib/businessDate'
import { formatMoney } from '@/lib/money'
import { lineTotal } from '@/lib/calc'
import { tenderLabel, type Movement } from '@/repositories/billing'

export interface DocumentView {
  number: string
  title: string
  shop: string
  shopContact?: string
  customer?: string
  customerContact?: string
  details: string[]
  rows: string[][]
  headings: string[]
  totals: [string, string][]
  terms?: string
}

export function invoiceDocument(i: Invoice): DocumentView {
  const currency = i.currency ?? 'USD'
  const money = (value: number) => formatMoney(value, { currency, displayCurrency: i.displayCurrency, pegRate: i.pegRate })
  return {
    number: i.number, title: 'Invoice', shop: i.shopName ?? 'Shop', shopContact: i.shopContact,
    customer: i.customerName, customerContact: i.customerContact, terms: i.warrantyTerms,
    details: [i.issuedDate ?? dateFromTimestamp(i.issuedAt) ?? 'Date unknown', currency, i.workOrderNumber, i.vehicleLabel, i.dueAt && 'Due ' + i.dueAt.slice(0, 10)].filter(Boolean) as string[],
    headings: ['Item', 'Qty', 'Unit price', 'Amount'],
    rows: i.lineItems.map(item => [item.description, String(item.quantity), money(item.unitPrice), money(lineTotal(item))]),
    totals: [['Subtotal', money(i.subtotal)], ['Shop supplies', money(i.shopSupplies)], ['Tax', money(i.tax)],
      ['Invoice total', money(i.total)], ['Paid', money(i.amountPaid)], ['Balance due', money(i.total - i.amountPaid)]],
  }
}

export function receiptDocument(p: Payment, i?: Invoice): DocumentView {
  const currency = p.currency ?? i?.currency ?? 'USD'
  const money = (value: number) => formatMoney(value, { currency, displayCurrency: p.displayCurrency, pegRate: p.pegRate })
  const title = p.reversesPaymentId ? 'Refund receipt' : p.isDeposit ? 'Deposit receipt' : 'Payment receipt'
  const totals: [string, string][] = [[p.reversesPaymentId ? 'Returned' : 'Received', money(p.amount)]]
  if (p.balanceAfter !== undefined) totals.push(['Balance after this receipt', money(p.balanceAfter)])
  return {
    number: p.number ?? p.id, title, shop: p.shopName ?? i?.shopName ?? 'Shop', customer: p.customerName ?? i?.customerName,
    details: [p.recordedDate ?? dateFromTimestamp(p.createdAt) ?? 'Date unknown', currency, p.documentNumber ?? i?.number].filter(Boolean) as string[],
    headings: ['Method', 'Reference'], rows: [[tenderLabel(p.method), p.reference || '—']], totals,
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!)

export function customerHtml(doc: DocumentView) {
  const esc = escapeHtml
  const header = doc.headings.map(h => '<th>' + esc(h) + '</th>').join('')
  const rows = doc.rows.map(row => '<tr>' + row.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('')
  const totals = doc.totals.map(([name, amount]) => '<tr><th>' + esc(name) + '</th><td>' + esc(amount) + '</td></tr>').join('')
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    esc(doc.title + ' ' + doc.number) + '</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;color:#16202b}h1{margin:.5em 0}p{margin:.2em 0;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:1.5rem 0;overflow-wrap:anywhere}th,td{text-align:left;padding:.5rem;border-bottom:1px solid #bbb}.totals{max-width:24rem;margin-left:auto}.totals td{text-align:right}tr{break-inside:avoid}</style><body><h2>' +
    esc(doc.shop) + '</h2><p>' + esc(doc.shopContact ?? '') + '</p><h1>' + esc(doc.title + ' ' + doc.number) + '</h1><p>' +
    esc(doc.details.join(' · ')) + '</p><p>' + esc(doc.customer ?? '') + '</p><p>' + esc(doc.customerContact ?? '') +
    '</p><table><thead><tr>' + header + '</tr></thead><tbody>' + rows + '</tbody></table><table class="totals">' + totals +
    '</table>' + (doc.terms ? '<h3>Warranty terms</h3><p>' + esc(doc.terms) + '</p>' : '') + '</body></html>'
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export function printDocument(doc: DocumentView) {
  const frame = document.createElement('iframe')
  frame.title = doc.title
  frame.style.cssText = 'position:fixed;width:1px;height:1px;bottom:0;border:0;opacity:0'
  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) return
    win.addEventListener('afterprint', () => frame.remove(), { once: true })
    win.focus()
    win.print()
  }
  frame.srcdoc = customerHtml(doc)
  document.body.append(frame)
}

export async function shareDocument(doc: DocumentView) {
  const file = new File([customerHtml(doc)], doc.number + '.html', { type: 'text/html' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: doc.title + ' ' + doc.number, files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  if (navigator.share) {
    const text = [doc.shop, doc.shopContact, doc.title + ' ' + doc.number, ...doc.details, doc.customer, doc.customerContact,
      doc.headings.join(' · '), ...doc.rows.map(r => r.join(' · ')), ...doc.totals.map(r => r.join('  ')), doc.terms].filter(Boolean).join('\n')
    try {
      await navigator.share({ title: doc.title + ' ' + doc.number, text })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  download(file, file.name)
}

function csvCell(value: string) {
  const guarded = /^[\s]*[=+@-]/.test(value) ? "'" + value : value
  return '"' + guarded.split('"').join('""') + '"'
}

export function downloadDayClose(movements: Movement[], invoices: Invoice[], date: string) {
  const lines = [['Date', 'Type', 'Document or category', 'Description', 'Reference', 'Method', 'Currency', 'Tender movement', 'Invoice subtotal', 'Shop supplies', 'Invoice tax', 'Invoice total'].join(',')]
  for (const m of movements) {
    const fields = [m.date, m.kind, m.document, m.description, m.reference, tenderLabel(m.method), m.currency]
    lines.push([...fields.map(csvCell), (m.amount / 100).toFixed(2), '', '', '', ''].join(','))
  }
  for (const i of invoices) {
    const fields = [date, 'invoice', i.number, i.customerName || '', i.workOrderNumber || '', '', i.currency || 'USD']
    const amounts = [i.subtotal, i.shopSupplies, i.tax, i.total].map(n => (n / 100).toFixed(2))
    lines.push([...fields.map(csvCell), '', ...amounts].join(','))
  }
  download(new Blob(['\uFEFF', lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), 'Automech-close-' + date + '.csv')
}
