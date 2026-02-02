// src/pages/OCRInvoice/OCRParser.js
// Hardened browser-compatible OCR invoice parser (heuristic-based, no ML)

import Tesseract from 'tesseract.js';

class InvoiceOCRParser {
  constructor() {
    this.worker = null;

    this.columnAliases = {
      item: ['item', 'description', 'product', 'particulars', 'service', 'goods', 'details', 'desc'],
      quantity: ['qty', 'quantity', 'units', 'unit', 'nos', 'no', 'quan'],
      rate: ['rate', 'price', 'unit price', 'unitprice', 'cost', 'each'],
      total: ['total', 'amount', 'line total', 'linetotal', 'sum', 'value']
    };
  }

  /* ---------------- OCR ---------------- */

  async initialize() {
    if (this.worker) return;

    this.worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
  }

  async extractText(imageFile) {
    if (!this.worker) await this.initialize();

    const imageUrl = URL.createObjectURL(imageFile);
    try {
      const result = await this.worker.recognize(imageUrl);
      return result.data.text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  /* ---------------- PARSING ENTRY ---------------- */

  parseInvoice(text) {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    return {
      party: this.extractParty(lines),
      invoiceNumber: this.extractInvoiceNumber(lines),
      date: this.extractDate(lines),
      items: this.extractItems(lines),
      totals: this.extractTotals(lines)
    };
  }

  /* ---------------- HEADER FIELDS ---------------- */

  extractParty(lines) {
    for (const line of lines.slice(0, 20)) {
      const m = line.match(/(?:bill\s*to|customer|client|sold\s*to|company|name)[:\s]+(.+)/i);
      if (m && m[1].length > 3) return m[1].trim();
    }
    return '';
  }

  extractInvoiceNumber(lines) {
    for (const line of lines.slice(0, 25)) {
      const m = line.match(/(?:invoice|inv)\s*(?:no|number|#)?[:\s]*([A-Z0-9-]+)/i);
      if (m) return m[1];
    }
    return '';
  }

  extractDate(lines) {
    for (const line of lines.slice(0, 25)) {
      const m = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d)) return d.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  /* ---------------- NUMBERS ---------------- */

  extractNumbers(line) {
    const pattern = /([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)/g;
    return [...line.matchAll(pattern)].map(m => ({
      value: parseFloat(m[1].replace(/[,₹$€£\s]/g, '')),
      text: m[1],
      position: m.index
    }));
  }

  /* ---------------- DESCRIPTION ---------------- */

  extractDescription(line) {
    let d = line.replace(/([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?)/g, '');
    d = d.replace(/\s{2,}/g, ' ').trim();
    d = d.replace(/^0?\d+[\s.]/, '').trim();
    return d;
  }

  isHeaderLike(line) {
    return (
      line === line.toUpperCase() &&
      line.length < 30 &&
      !/\d/.test(line)
    );
  }

  /* ---------------- ITEM EXTRACTION ---------------- */

  extractItems(lines) {
  const items = [];
  let currentDesc = '';
  let tableStarted = false;

  const isYearLike = n => n >= 1900 && n <= 2100;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop once totals hit
    if (/(subtotal|grand\s*total|amount\s*due|tax|vat)/i.test(line)) {
      break;
    }

    if (this.isHeaderLike(line)) continue;

    const numbers = this.extractNumbers(line);
    const description = this.extractDescription(line);

    // Accumulate description before table starts
    if (!tableStarted) {
      if (numbers.length === 0 && description.length > 2) {
        currentDesc = description;
      }
    }

    if (numbers.length < 2) continue;

    const values = numbers.map(n => n.value).sort((a, b) => a - b);
    const total = values[values.length - 1];

    // Reject year-only noise
    if (values.every(isYearLike)) continue;
    if (total < 20) continue;

    let qty = null;
    let rate = null;

    const possibleQty = values.find(v => v > 0 && v <= 100 && !isYearLike(v));

    if (values.length === 2) {
      if (possibleQty) {
        qty = possibleQty;
        rate = total / qty;
      } else {
        qty = 1;
        rate = values[0];
      }
    } else {
      qty = possibleQty;
      rate = values[values.length - 2];
    }

    if (!qty || !rate) continue;

    const calc = qty * rate;
    const tolerance = Math.abs(calc - total) / total;

    // 🚨 THIS IS THE TABLE LOCK
    if (!tableStarted) {
      if (tolerance < 0.25 && (description || currentDesc)) {
        tableStarted = true;
      } else {
        continue;
      }
    }

    const finalDesc = description || currentDesc;
    if (!finalDesc || finalDesc.length < 2) continue;

    items.push({
      itemName: finalDesc,
      itemCode: this.generateItemCode(finalDesc),
      qty,
      rate,
      amount: total
    });

    currentDesc = '';
  }

  return items;
}


  generateItemCode(name) {
    return (
      name
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .slice(0, 3)
        .map(w => w.slice(0, 3).toUpperCase())
        .join('') || 'ITEM'
    );
  }

  /* ---------------- TOTALS ---------------- */

  extractTotals(lines) {
    let subtotal = 0, tax = 0, grandTotal = 0;

    for (const line of lines) {
      if (/subtotal/i.test(line)) subtotal = this.extractNumbers(line).pop()?.value || subtotal;
      if (/tax|vat|gst/i.test(line)) tax = this.extractNumbers(line).pop()?.value || tax;
      if (/grand\s*total|amount\s*due/i.test(line)) {
        grandTotal = this.extractNumbers(line).pop()?.value || grandTotal;
      }
    }

    return { subtotal, tax, grandTotal };
  }

  /* ---------------- FRAPPE ---------------- */

  normalizeToFrappe(data) {
    const computedTotal = data.items.reduce((s, i) => s + i.amount, 0);

    return {
      doctype: 'Sales Invoice',
      party: data.party,
      party_name: data.party,
      posting_date: data.date,
      due_date: data.date,
      invoice_number: data.invoiceNumber,
      items: data.items.map(i => ({
        item_code: i.itemCode,
        item_name: i.itemName,
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
        uom: 'Nos'
      })),
      total: computedTotal,
      grand_total: data.totals.grandTotal || computedTotal
    };
  }

  async processInvoice(imageFile) {
    const text = await this.extractText(imageFile);
    const parsed = this.parseInvoice(text);
    return this.normalizeToFrappe(parsed);
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export default InvoiceOCRParser;
