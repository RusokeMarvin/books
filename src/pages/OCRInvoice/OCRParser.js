// src/pages/OCRInvoice/OCRParser.js
// Browser-compatible OCR parser using Tesseract.js with column-based extraction

import Tesseract from 'tesseract.js';

class InvoiceOCRParser {
  constructor() {
    this.worker = null;
    
    // Column keyword aliases for fuzzy matching
    this.columnAliases = {
      item: ['item', 'description', 'product', 'particulars', 'service', 'goods', 'details', 'desc'],
      quantity: ['qty', 'quantity', 'units', 'unit', 'nos', 'no', 'amount', 'quan'],
      rate: ['rate', 'price', 'unit price', 'unitprice', 'cost', 'each'],
      total: ['total', 'amount', 'line total', 'linetotal', 'sum', 'value']
    };
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
      items: this.extractItemsColumnBased(lines),
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

  /* ---------------- COLUMN-BASED ITEM EXTRACTION ---------------- */

  /**
   * Fuzzy match a word against column aliases
   */
  matchColumnType(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    
    for (const [type, aliases] of Object.entries(this.columnAliases)) {
      for (const alias of aliases) {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z]/g, '');
        // Exact match or contains
        if (word === cleanAlias || word.includes(cleanAlias) || cleanAlias.includes(word)) {
          return type;
        }
      }
    }
    return null;
  }

  /**
   * Find the header row and determine column positions
   */
  findTableStructure(lines) {
    console.log('=== Finding Table Structure ===');
    
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];
      const words = line.split(/\s+/);
      
      // Check if this line contains column headers
      const columnMatches = {};
      let matchCount = 0;
      
      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        const columnType = this.matchColumnType(word);
        
        if (columnType && !columnMatches[columnType]) {
          columnMatches[columnType] = {
            index: j,
            word: word,
            position: line.indexOf(word)
          };
          matchCount++;
        }
      }
      
      // Need at least 2 key columns (quantity + one of item/rate/total)
      if (matchCount >= 2 && columnMatches.quantity) {
        console.log('Found header at line', i, ':', line);
        console.log('Column matches:', columnMatches);
        
        return {
          headerLineIndex: i,
          columns: columnMatches,
          headerLine: line
        };
      }
    }
    
    console.log('No clear header found, will try to detect columns from data');
    return null;
  }

  /**
   * Extract numeric values from a line
   */
  extractNumbers(line) {
    // Match numbers with optional currency symbols and commas
    const numberPattern = /([₹$€£]?\s*\d+(?:,\d{3})*(?:\.\d{2})?)/g;
    const matches = [...line.matchAll(numberPattern)];
    return matches.map(m => ({
      value: parseFloat(m[1].replace(/[,₹$€£\s]/g, '')),
      position: m.index,
      text: m[1]
    }));
  }

  /**
   * Determine if a line is an item row (has numbers that could be qty/price/total)
   */
  isItemRow(line) {
    const numbers = this.extractNumbers(line);
    // Item rows typically have 2-4 numbers (qty, rate, maybe unit price, total)
    return numbers.length >= 2 && numbers.length <= 4;
  }

  /**
   * Extract description from a line (the non-numeric part)
   */
  extractDescription(line) {
    // Remove all numbers and excessive spaces
    let desc = line.replace(/\d+[,.]?\d*\s*(?:each|pcs?|unit|nos)?/gi, '');
    desc = desc.replace(/[₹$€£]/g, '');
    desc = desc.replace(/\s{2,}/g, ' ').trim();
    
    // Remove leading ID numbers (like "01", "02", etc.)
    desc = desc.replace(/^0?\d+[\s.]/, '').trim();
    
    return desc;
  }

  /**
   * Smart item extraction using column awareness
   */
  extractItemsColumnBased(lines) {
    console.log('=== Starting Column-Based Extraction ===');
    
    const items = [];
    const tableStructure = this.findTableStructure(lines);
    
    let startLine = 0;
    if (tableStructure) {
      startLine = tableStructure.headerLineIndex + 1;
      console.log('Starting extraction from line', startLine);
    } else {
      console.log('No header found, scanning for data rows');
      // Find first line that looks like an item
      for (let i = 0; i < lines.length; i++) {
        if (this.isItemRow(lines[i])) {
          startLine = i;
          console.log('Found first item-like row at line', i);
          break;
        }
      }
    }
    
    let currentItemDesc = '';
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      // Stop at totals/footer
      if (/(subtotal|grand\s*total|amount\s*due|tax|discount|thank\s*you|payment)/i.test(line)) {
        console.log('Reached totals section at line', i);
        break;
      }
      
      console.log(`\nProcessing line ${i}:`, line);
      
      const numbers = this.extractNumbers(line);
      console.log('Extracted numbers:', numbers);
      
      // If line has no numbers or only one number, it's likely a description continuation
      if (numbers.length < 2) {
        const desc = this.extractDescription(line);
        if (desc.length > 2 && !/(^id$|^item$|^description$|^qty$)/i.test(desc)) {
          currentItemDesc = desc;
          console.log('Saved description for next line:', currentItemDesc);
        }
        continue;
      }
      
      // This line has numbers - it's an item row
      const description = this.extractDescription(line);
      
      // Use accumulated description if current line has very short/no description
      const finalDescription = description.length > 2 ? description : currentItemDesc;
      
      if (finalDescription.length < 2) {
        console.log('Skipping - no valid description');
        continue;
      }
      
      // Smart number interpretation
      let qty, rate, total;
      
      if (numbers.length === 2) {
        // Likely: QTY TOTAL or RATE TOTAL
        // Check if first number is small (likely qty) or large (likely rate/total)
        if (numbers[0].value <= 100) {
          qty = numbers[0].value;
          total = numbers[1].value;
          rate = total / qty;
        } else {
          // First number is large, likely rate and total
          rate = numbers[0].value;
          total = numbers[1].value;
          qty = 1;
        }
      } else if (numbers.length === 3) {
        // Likely: QTY RATE TOTAL
        qty = numbers[0].value;
        rate = numbers[1].value;
        total = numbers[2].value;
      } else if (numbers.length >= 4) {
        // Likely: ID QTY RATE TOTAL or QTY UNIT_PRICE RATE TOTAL
        // Skip first (ID) or use last 3 numbers
        qty = numbers[numbers.length - 3].value;
        rate = numbers[numbers.length - 2].value;
        total = numbers[numbers.length - 1].value;
      }
      
      console.log('Interpreted as:', { description: finalDescription, qty, rate, total });
      
      // Validation
      if (!qty || !rate || !total || qty <= 0 || rate <= 0 || total <= 0) {
        console.log('Failed validation - invalid numbers');
        continue;
      }
      
      // Verify calculation (allow 15% tolerance for rounding/tax)
      const calculatedTotal = qty * rate;
      const tolerance = Math.abs(calculatedTotal - total) / total;
      
      if (tolerance > 0.15) {
        console.log(`Warning: Math doesn't match (${tolerance.toFixed(2)}% off). Calculated: ${calculatedTotal}, Got: ${total}`);
        // Still accept it but use the stated total
      }
      
      console.log('✓ Successfully extracted item');
      
      items.push({
        itemName: finalDescription,
        itemCode: this.generateItemCode(finalDescription),
        qty: qty,
        rate: rate,
        amount: total,
      });
      
      // Clear accumulated description
      currentItemDesc = '';
    }
    
    console.log(`\n=== Extraction Complete: ${items.length} items found ===`);
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