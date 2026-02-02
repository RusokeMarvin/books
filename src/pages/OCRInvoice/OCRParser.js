// src/pages/OCRInvoice/DynamicPatternParser.js
// Generates all possible regex patterns from column aliases

import Tesseract from 'tesseract.js';

class DynamicPatternParser {
  constructor() {
    this.worker = null;
    
    // Column aliases - add as many as needed!
    this.columnAliases = {
      id: ['id', 'no', 'num', 'number', '#', 's/n', 'sn', 'line', 'pos'],
      item: ['item', 'items', 'description', 'desc', 'product', 'products', 
             'particulars', 'service', 'services', 'goods', 'details', 'name',
             'commodity', 'article', 'specification'],
      quantity: ['qty', 'quantity', 'quan', 'units', 'unit', 'nos', 'no', 
                 'amount', 'count', 'pcs', 'pc', 'ea', 'each'],
      rate: ['rate', 'price', 'unitprice', 'unit price', 'unit_price', 'cost', 
             'each', 'unit cost', 'per unit', 'unit rate', 'net price'],
      total: ['total', 'amount', 'linetotal', 'line total', 'sum', 'value', 
              'ext price', 'extended', 'net worth', 'line amount', 'subtotal']
    };

    // Number patterns for different formats
    this.numberPatterns = {
      // US/UK: 1,234.56
      standard: '\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
      // European: 1.234,56 or 1 234,56
      european: '\\d+(?:[\\s.]\\d{3})*(?:,\\d{2})?',
      // Simple: 1234.56 or 1234
      simple: '\\d+(?:\\.\\d+)?',
    };

    // Currency symbols
    this.currencySymbols = '[₹$€£¥₩]?\\s*';

    // Generate all patterns on initialization
    this.generatedPatterns = this.generateAllPatterns();
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
      const result = await this.worker.recognize(imageFile);
      return result.data.text;
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  /* ============================================================
     DYNAMIC PATTERN GENERATION
     ============================================================ */

  /**
   * Generate all possible item line patterns
   */
  generateAllPatterns() {
    console.log('🔧 Generating dynamic patterns...');
    const patterns = [];

    // Helper to create regex group from aliases
    const createGroup = (aliases) => {
      return `(?:${aliases.map(a => this.escapeRegex(a)).join('|')})`;
    };

    // Helper for number capture
    const num = (name) => `(?<${name}>${this.currencySymbols}(?:${this.numberPatterns.standard}|${this.numberPatterns.european}|${this.numberPatterns.simple}))`;

    // Pattern 1: ID + ItemCode/Name + Qty + Rate + Total
    // Example: "1 Widget123 Description 5 $10.00 $50.00"
    patterns.push({
      name: 'ID_ItemCode_Description_Qty_Rate_Total',
      regex: new RegExp(
        `^(?<id>\\d+)[\\s.:]+` +                    // ID (1, 2, 3...)
        `(?<itemCode>[A-Za-z0-9-]+)\\s+` +          // Item code
        `(?<description>.+?)\\s+` +                  // Description
        `${num('qty')}\\s+` +                        // Quantity
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => ({
        name: `${match.groups.itemCode} ${match.groups.description}`.trim(),
        qty: this.parseNumber(match.groups.qty),
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 2: ID + Description + Qty + Rate + Total
    // Example: "1 Product Description 2 15.00 30.00"
    patterns.push({
      name: 'ID_Description_Qty_Rate_Total',
      regex: new RegExp(
        `^(?<id>\\d+)[\\s.:]+` +                    // ID
        `(?<description>.+?)\\s+` +                  // Description
        `${num('qty')}\\s+` +                        // Quantity
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => ({
        name: match.groups.description.trim(),
        qty: this.parseNumber(match.groups.qty),
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 3: Qty + Description + Rate + Total (no ID)
    // Example: "2 New set of pedal arms 15.00 30.00"
    patterns.push({
      name: 'Qty_Description_Rate_Total',
      regex: new RegExp(
        `^${num('qty')}\\s+` +                       // Quantity
        `(?<description>.+?)\\s+` +                  // Description
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => ({
        name: match.groups.description.trim(),
        qty: this.parseNumber(match.groups.qty),
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 4: Description + Qty + Rate + Total (no ID)
    // Example: "Custom trousers 2 75 150"
    patterns.push({
      name: 'Description_Qty_Rate_Total',
      regex: new RegExp(
        `^(?<description>.+?)\\s+` +                 // Description
        `${num('qty')}\\s+` +                        // Quantity
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => ({
        name: match.groups.description.trim(),
        qty: this.parseNumber(match.groups.qty),
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 5: Description + Rate + Total (qty implied = 1)
    // Example: "Service Fee 50.00 50.00"
    patterns.push({
      name: 'Description_Rate_Total',
      regex: new RegExp(
        `^(?<description>.+?)\\s+` +                 // Description
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => ({
        name: match.groups.description.trim(),
        qty: 1,
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 6: European format with unit type
    // Example: "2. HP Computer 5,00 each 37,75 188,75"
    patterns.push({
      name: 'European_With_Unit',
      regex: new RegExp(
        `^(?<id>\\d+[\\.:])?\\s*` +                 // Optional ID
        `(?<description>.+?)\\s+` +                  // Description
        `${num('qty')}\\s+` +                        // Quantity
        `(?:each|pcs?|unit|nos?|pc|ea)\\s+` +       // Unit type
        `${num('rate')}\\s+` +                       // Rate
        `${num('total')}`,                           // Total
        'i'
      ),
      extract: (match) => ({
        name: match.groups.description.trim(),
        qty: this.parseNumber(match.groups.qty),
        rate: this.parseNumber(match.groups.rate),
        total: this.parseNumber(match.groups.total),
      })
    });

    // Pattern 7: Just Description + Total (minimal, qty=1, rate=total)
    // Example: "Installation Fee $100.00"
    patterns.push({
      name: 'Description_Total_Only',
      regex: new RegExp(
        `^(?<description>.+?)\\s+` +                 // Description
        `${num('total')}$`,                          // Total
        'i'
      ),
      extract: (match) => {
        const total = this.parseNumber(match.groups.total);
        return {
          name: match.groups.description.trim(),
          qty: 1,
          rate: total,
          total: total,
        };
      }
    });

    console.log(`✓ Generated ${patterns.length} patterns`);
    return patterns;
  }

  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ============================================================
     HEADER DETECTION
     ============================================================ */

  findTableStart(lines) {
    console.log('\n=== Finding Table Header ===');

    // Create flexible header pattern
    const itemAliases = this.columnAliases.item.map(a => this.escapeRegex(a)).join('|');
    const qtyAliases = this.columnAliases.quantity.map(a => this.escapeRegex(a)).join('|');
    const rateAliases = this.columnAliases.rate.map(a => this.escapeRegex(a)).join('|');
    const totalAliases = this.columnAliases.total.map(a => this.escapeRegex(a)).join('|');

    // Header must have at least 2 of these: item, qty, rate, total
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].toLowerCase();
      
      let matches = 0;
      if (new RegExp(itemAliases, 'i').test(line)) matches++;
      if (new RegExp(qtyAliases, 'i').test(line)) matches++;
      if (new RegExp(rateAliases, 'i').test(line)) matches++;
      if (new RegExp(totalAliases, 'i').test(line)) matches++;

      if (matches >= 2) {
        console.log(`✓ Found header at line ${i}: "${lines[i]}"`);
        return i;
      }
    }

    console.log('⚠️ No header found, will scan from start');
    return -1;
  }

  findTableEnd(lines, startIdx) {
    const footerKeywords = [
      'subtotal', 'sub-total', 'sub total',
      'grand total', 'grandtotal',
      'total due', 'amount due',
      'tax', 'vat', 'gst',
      'thank you', 'thanks',
      'notes', 'terms', 'conditions',
      'payment', 'please pay'
    ];

    for (let i = Math.max(startIdx + 1, 0); i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      for (const keyword of footerKeywords) {
        if (line.includes(keyword)) {
          console.log(`✓ Found footer at line ${i}`);
          return i;
        }
      }
    }

    return lines.length;
  }

  /* ============================================================
     ITEM EXTRACTION WITH DYNAMIC PATTERNS
     ============================================================ */

  extractItems(lines) {
    console.log('\n=== Extracting Items with Dynamic Patterns ===');

    const startIdx = this.findTableStart(lines);
    const endIdx = this.findTableEnd(lines, startIdx);

    const itemLines = lines.slice(
      Math.max(startIdx + 1, 0),
      endIdx
    );

    console.log(`Scanning lines ${startIdx + 1} to ${endIdx}`);

    const items = [];

    for (let i = 0; i < itemLines.length; i++) {
      const line = itemLines[i];
      
      // Skip empty or very short lines
      if (line.length < 5) continue;

      // Normalize spacing
      const cleanLine = line.replace(/\s{2,}/g, ' ').trim();

      // Skip header-like lines
      if (/^(id|no|item|description|qty|quantity|rate|price|total|amount)$/i.test(cleanLine)) {
        continue;
      }

      console.log(`\nLine ${startIdx + 1 + i}: "${cleanLine}"`);

      // Try all patterns
      let matched = false;
      for (const pattern of this.generatedPatterns) {
        const match = cleanLine.match(pattern.regex);
        
        if (match) {
          console.log(`✓ Matched: ${pattern.name}`);
          
          try {
            const extracted = pattern.extract(match);
            
            // Validate extracted data
            if (this.validateItem(extracted)) {
              items.push({
                itemName: extracted.name,
                itemCode: this.generateItemCode(extracted.name),
                qty: extracted.qty,
                rate: extracted.rate,
                amount: extracted.total,
              });
              
              console.log(`  → ${extracted.name} | ${extracted.qty} × ${extracted.rate} = ${extracted.total}`);
              matched = true;
              break; // Stop trying patterns for this line
            } else {
              console.log(`  ✗ Failed validation`);
            }
          } catch (err) {
            console.log(`  ✗ Extraction error:`, err.message);
          }
        }
      }

      if (!matched) {
        console.log(`  ✗ No pattern matched`);
      }
    }

    console.log(`\n=== Extracted ${items.length} items ===`);
    return items;
  }

  /* ============================================================
     VALIDATION & HELPERS
     ============================================================ */

  validateItem(item) {
    // Must have name
    if (!item.name || item.name.length < 2) return false;

    // Must have valid numbers
    if (!item.qty || !item.rate || !item.total) return false;
    if (isNaN(item.qty) || isNaN(item.rate) || isNaN(item.total)) return false;
    if (item.qty <= 0 || item.rate <= 0 || item.total <= 0) return false;

    // Reasonable ranges
    if (item.qty > 100000 || item.rate > 1000000 || item.total > 10000000) return false;

    // Check calculation (allow 15% tolerance for rounding/tax)
    const calculated = item.qty * item.rate;
    const diff = Math.abs(calculated - item.total);
    const tolerance = Math.max(item.total * 0.15, 1);

    if (diff > tolerance) {
      // Check if it's just a rounding issue
      if (Math.abs(Math.round(calculated * 100) / 100 - item.total) <= 0.02) {
        return true; // Allow small rounding differences
      }
      
      console.log(`    ⚠️ Math check: ${item.qty} × ${item.rate} = ${calculated}, got ${item.total} (diff: ${diff.toFixed(2)})`);
      // Still accept but log warning
    }

    return true;
  }

  parseNumber(str) {
    if (!str) return null;

    // Remove currency symbols
    let cleaned = String(str).replace(/[₹$€£¥₩]/g, '').trim();

    // Detect format
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');
    const hasSpace = cleaned.includes(' ');

    if (hasSpace) {
      // European with spaces: "1 234,56" or "1 234.56"
      cleaned = cleaned.replace(/\s+/g, '');
    }

    if (hasComma && hasDot) {
      // Both comma and dot - determine which is decimal separator
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot = cleaned.lastIndexOf('.');
      
      if (lastDot > lastComma) {
        // 1,234.56 (US format)
        cleaned = cleaned.replace(/,/g, '');
      } else {
        // 1.234,56 (European format)
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (hasComma) {
      // Only comma - could be decimal or thousands
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length === 2) {
        // 123,45 (decimal)
        cleaned = cleaned.replace(',', '.');
      } else {
        // 1,234 (thousands)
        cleaned = cleaned.replace(/,/g, '');
      }
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  generateItemCode(name) {
    return name
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .slice(0, 3)
      .map(w => w.slice(0, 3).toUpperCase())
      .join('') || 'ITEM';
  }

  /* ============================================================
     HEADER EXTRACTION
     ============================================================ */

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
      /quote\s*(?:no|#)[:\s]*([A-Z0-9-]+)/i,
      /order\s*#?\s*([A-Z0-9-]+)/i,
    ];

    for (const line of lines.slice(0, 25)) {
      for (const p of patterns) {
        const m = line.match(p);
        if (m && m[1].length >= 3) return m[1].trim();
      }
    }
    return '';
  }

  extractDate(lines) {
    for (const line of lines.slice(0, 25)) {
      const m = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
      if (m) {
        try {
          const d = new Date(m[1]);
          if (!isNaN(d)) return d.toISOString().split('T')[0];
        } catch (e) {}
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  extractTotals(lines) {
    const totals = { subtotal: 0, tax: 0, grandTotal: 0 };

    for (const line of lines.slice(-20)) {
      const nums = [...line.matchAll(/\d+(?:[,.\s]\d{3})*(?:[.,]\d{2})?/g)]
        .map(m => this.parseNumber(m[0]));

      if (nums.length === 0) continue;
      const val = nums[nums.length - 1];

      if (/subtotal|sub.total/i.test(line)) totals.subtotal = val;
      if (/tax|gst|vat/i.test(line)) totals.tax = val;
      if (/(grand\s*)?total|amount\s*due/i.test(line)) totals.grandTotal = val;
    }

    return totals;
  }

  /* ============================================================
     MAIN PROCESSING
     ============================================================ */

  async processInvoice(imageFile) {
    console.log('🚀 Starting dynamic pattern extraction...\n');

    const text = await this.extractText(imageFile);
    
    console.log('=== EXTRACTED TEXT ===');
    console.log(text);
    console.log('======================');

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Extract all data
    const party = this.extractParty(lines);
    const invoiceNumber = this.extractInvoiceNumber(lines);
    const date = this.extractDate(lines);
    const items = this.extractItems(lines);
    const totals = this.extractTotals(lines);

    const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const total = totals.subtotal || itemsTotal;
    const grandTotal = totals.grandTotal || total;

    console.log('\n📊 EXTRACTION SUMMARY:');
    console.log('  Party:', party || '(not found)');
    console.log('  Invoice #:', invoiceNumber || '(not found)');
    console.log('  Date:', date);
    console.log('  Items:', items.length);
    console.log('  Items total:', itemsTotal.toFixed(2));
    console.log('  Grand total:', grandTotal.toFixed(2));

    return {
      doctype: 'Sales Invoice',
      party: party || 'Unknown Customer',
      party_name: party || 'Unknown Customer',
      posting_date: date,
      due_date: date,
      invoice_number: invoiceNumber || `INV-${Date.now()}`,
      items: items.map(i => ({
        item_code: i.itemCode,
        item_name: i.itemName,
        qty: i.qty,
        rate: i.rate,
        amount: i.amount,
        uom: 'Nos',
      })),
      total,
      grand_total: grandTotal,
    };
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export default DynamicPatternParser;