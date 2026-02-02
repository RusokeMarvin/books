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
      const result = await this.worker.recognize(imageUrl);
      
      // Console log the full Tesseract result
      console.log('Tesseract Full Result:', JSON.stringify(result, null, 2));
      console.log('Tesseract Data Object:', result.data);
      
      return result.data.text;
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
    let itemsSectionStarted = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Start table - more flexible header detection
      if (
        /(item|hem|description|particulars|product)/i.test(line) &&
        /(qty|quantity|unit\s*price|unitprice|rate|total|amount)/i.test(line)
      ) {
        inItems = true;
        itemsSectionStarted = true;
        continue;
      }

      // Alternative: detect items section by finding "BILL TO" or "SHIP TO" followed by address,
      // then looking for lines that match item patterns
      if (!itemsSectionStarted && /(bill\s*to|ship\s*to)/i.test(line)) {
        // Skip next few lines (address info), then start looking for items
        let skipLines = 0;
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          if (/\d+\s+.+\s+\d+\.\d{2}\s+\d+\.\d{2}/.test(lines[j])) {
            inItems = true;
            itemsSectionStarted = true;
            break;
          }
        }
      }

      // End table
      if (/(subtotal|grand\s*total|amount\s*due|tax|discount|thank\s*you|payment\s*is\s*due|sales\s*tax)/i.test(line)) {
        if (inItems) break; // Only break if we've started items section
      }

      // If no header found but we see a pattern that looks like an item line, start extracting
      if (!itemsSectionStarted) {
        // Pattern: starts with number, has description, ends with two money amounts
        if (/^\d+\s+.+\s+\d+\.\d{2}\s+\d+\.\d{2}/.test(line)) {
          inItems = true;
          itemsSectionStarted = true;
        }
      }

      if (!inItems) continue;

      // Normalize OCR spacing
      const cleanLine = line.replace(/\s{2,}/g, ' ').trim();
      
      // Skip very short lines or lines that look like headers
      if (cleanLine.length < 5 || /^(id|item|description|qty|quantity|rate|price|total|amount)$/i.test(cleanLine)) {
        continue;
      }

      // Debug log each line we're trying to match
      console.log('Trying to match line:', cleanLine);

      let match = null;
      let name, qty, rate, amount;
      
      // Pattern A: ID# ItemCode Description Qty Rate Total (first template with ID column)
      // e.g., "1 cr 27sxii 27" PURE FLAT TV $612.50 $612.50"
      match = cleanLine.match(
        /^(\d+)\s+([a-zA-Z0-9-]+)\s+(.+?)\s+([₹$€£e]?\s*\d+(?:,\d{3})*(?:\.\d+)?)\s+([₹$€£e]?\s*\d+(?:,\d{3})*(?:\.\d+)?)$/
      );
      
      if (match) {
        console.log('Matched Pattern A (ID ItemCode Description Rate Total)');
        // match[1] is ID (skip), match[2] is item code
        const itemCode = match[2];
        name = `${itemCode} ${match[3].trim()}`;
        rate = parseFloat(match[4].replace(/[,₹$€£e]/g, ''));
        amount = parseFloat(match[5].replace(/[,₹$€£e]/g, ''));
        // Calculate qty from amount and rate
        qty = rate > 0 ? Math.round(amount / rate) : 1;
      } else {
        // Pattern B: QTY DESCRIPTION UNIT_PRICE AMOUNT (third template)
        // e.g., "2 New set of pedal arms 15.00 30.00"
        match = cleanLine.match(
          /^(\d+)\s+(.+?)\s+([₹$€£e]?\s*\d+\.\d{2})\s+([₹$€£e]?\s*\d+\.\d{2})$/
        );
        
        if (match) {
          console.log('Matched Pattern B (QTY DESCRIPTION UNIT_PRICE AMOUNT)');
          qty = parseFloat(match[1]);
          name = match[2].trim();
          rate = parseFloat(match[3].replace(/[,₹$€£e]/g, ''));
          amount = parseFloat(match[4].replace(/[,₹$€£e]/g, ''));
        } else {
          // Pattern C: Description Qty Rate Total (second template - no ID)
          // e.g., "Custom childrens trousers (boys) 2 75 e150"
          match = cleanLine.match(
            /^(.+?)\s+(\d+)\s+([₹$€£e]?\s*\d+(?:,\d{3})*(?:\.\d+)?)\s+([₹$€£e]?\s*\d+(?:,\d{3})*(?:\.\d+)?)$/
          );
          
          if (match && !/^\d+$/.test(match[1])) {
            console.log('Matched Pattern C (Description Qty Rate Total)');
            name = match[1].trim();
            qty = parseFloat(match[2]);
            rate = parseFloat(match[3].replace(/[,₹$€£e]/g, ''));
            amount = parseFloat(match[4].replace(/[,₹$€£e]/g, ''));
          }
        }
      }

      if (!match) {
        console.log('No match for line:', cleanLine);
        continue;
      }

      // Validation
      if (
        name.length < 2 ||
        isNaN(qty) ||
        isNaN(rate) ||
        isNaN(amount) ||
        amount <= 0 ||
        qty <= 0
      ) {
        console.log('Failed validation:', { name, qty, rate, amount });
        continue;
      }

      console.log('Successfully extracted item:', { name, qty, rate, amount });

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
    
    // Debug logging
    console.log('Parsed Invoice Data:', parsed);
    console.log('Extracted Items:', parsed.items);
    
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