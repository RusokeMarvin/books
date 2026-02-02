// src/pages/OCRInvoice/OCRParser.js
// Browser-compatible OCR parser using Tesseract.js

import Tesseract from 'tesseract.js';

class InvoiceOCRParser {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    if (this.worker) return;

    this.worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
  }

  async extractText(imageFile) {
    if (!this.worker) await this.initialize();

    const imageUrl = URL.createObjectURL(imageFile);
    try {
      const { data: { text } } = await this.worker.recognize(imageUrl);
      return text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  /* ---------------- CORE PARSING ---------------- */

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
      totals: this.extractTotals(lines),
    };
  }

  extractParty(lines) {
    const patterns = [
      /(?:bill\s*to|customer|client|sold\s*to)[:\s]+(.+)/i,
      /(?:company|name)[:\s]+(.+)/i,
    ];

    for (const line of lines.slice(0, 20)) {
      for (const p of patterns) {
        const m = line.match(p);
        if (m && m[1].length > 3) {
          return m[1].replace(/[^\w\s&.-]/g, '').trim();
        }
      }
    }
    return '';
  }

  extractInvoiceNumber(lines) {
    const patterns = [
      /invoice\s*(?:no|number|#)[:\s]*([A-Z0-9-]+)/i,
      /inv[:\s]*([A-Z0-9-]+)/i,
    ];

    for (const line of lines.slice(0, 25)) {
      for (const p of patterns) {
        const m = line.match(p);
        if (m) return m[1].trim();
      }
    }
    return '';
  }

  extractDate(lines) {
    for (const line of lines.slice(0, 25)) {
      const m = line.match(
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/
      );
      if (m) {
        const d = new Date(m[1]);
        if (!isNaN(d)) return d.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  /* ---------------- ITEMS (IMPROVED, SAME STYLE) ---------------- */

  extractItems(lines) {
    const items = [];
    let inItems = false;

    const money = /[₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d+)?/;

    for (const line of lines) {
      // Start table
      if (
  /(item|description|particulars|product)/i.test(line) &&
  /(qty|quantity|unit\s*price|rate|total|amount)/i.test(line)
) {
  inItems = true;
  continue;
}


      // End table
      if (/(subtotal|grand\s*total|amount\s*due|tax)/i.test(line)) {
        break;
      }

      if (!inItems) continue;

      // Normalize OCR spacing
      const cleanLine = line.replace(/\s{2,}/g, ' ');

      let match =
  // Pattern A: old template (description [qty] rate amount)
  cleanLine.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)?\s*([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d+)?)\s+([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d+)?)$/
  ) ||

  // Pattern B: new template (description qty unit_price total)
  cleanLine.match(
    /^(.+?)\s+(\d+)\s+([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d+)?)\s+([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d+)?)$/
  );

if (!match) continue;


      const name = match[1].trim();
      const qty = match[2] ? parseFloat(match[2]) : 1;
      const rate = parseFloat(match[3].replace(/[,₹$€£]/g, ''));
      const amount = parseFloat(match[4].replace(/[,₹$€£]/g, ''));

      if (
        name.length < 2 ||
        isNaN(rate) ||
        isNaN(amount) ||
        amount <= 0
      ) continue;

      items.push({
        itemName: name,
        itemCode: this.generateItemCode(name),
        qty,
        rate,
        amount,
      });
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
    const totals = { subtotal: 0, tax: 0, grandTotal: 0 };

    for (const line of lines.slice(-20)) {
      if (/subtotal/i.test(line))
        totals.subtotal = parseFloat(line.replace(/[^0-9.]/g, '')) || 0;

      if (/tax|vat|gst/i.test(line))
        totals.tax = parseFloat(line.replace(/[^0-9.]/g, '')) || 0;

      if (/total|amount\s*due/i.test(line))
        totals.grandTotal = parseFloat(line.replace(/[^0-9.]/g, '')) || 0;
    }

    return totals;
  }

  /* ---------------- FRAPPE ---------------- */

  normalizeToFrappe(data) {
    const total =
      data.totals.subtotal ||
      data.items.reduce((s, i) => s + (i.amount || 0), 0);

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
        uom: 'Nos',
      })),
      total,
      grand_total: data.totals.grandTotal || total,
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