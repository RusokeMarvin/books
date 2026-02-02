// src/pages/OCRInvoice/OCRParser.js
// Browser-compatible OCR parser using Tesseract.js

import Tesseract from 'tesseract.js';

class InvoiceOCRParser {
  constructor() {
    this.worker = null;
  }

  async initialize() {
    if (this.worker) return;
    
    // Initialize Tesseract worker
    this.worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
  }

  async extractText(imageFile) {
    if (!this.worker) {
      await this.initialize();
    }

    console.log('Extracting text from image...');
    
    // Convert File to ImageData or URL
    const imageUrl = URL.createObjectURL(imageFile);
    
    try {
      const { data: { text } } = await this.worker.recognize(imageUrl);
      URL.revokeObjectURL(imageUrl);
      return text;
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      throw error;
    }
  }

  parseInvoice(text) {
    const lines = text.split('\n').filter(line => line.trim());

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
      /(?:Bill\s+to|Customer|Client|To)[:\s]+(.+)/i,
      /(?:Name)[:\s]+(.+)/i,
      /(?:Company)[:\s]+(.+)/i,
    ];

    for (const line of lines.slice(0, 20)) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const party = match[1].trim().replace(/[^\w\s&.-]/g, '');
          if (party.length > 3) {
            return party;
          }
        }
      }
    }
    return '';
  }

  extractInvoiceNumber(lines) {
    const patterns = [
      /(?:Invoice|INV|Bill)\s*(?:No|Number|#)[:\s]*([A-Z0-9-]+)/i,
      /#\s*([A-Z0-9-]+)/i,
      /(?:Invoice)[:\s]*([A-Z0-9-]+)/i,
    ];

    for (const line of lines.slice(0, 25)) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return match[1].trim();
        }
      }
    }
    return '';
  }

  extractDate(lines) {
    const datePatterns = [
      /(?:Date|Dated)[:\s]+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
      /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
    ];

    for (const line of lines.slice(0, 25)) {
      for (const pattern of datePatterns) {
        const match = line.match(pattern);
        if (match) {
          const dateStr = match[1].trim();
          // Try to parse and standardize date
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0];
            }
          } catch (e) {
            // Try different formats
            const parts = dateStr.split(/[-/]/);
            if (parts.length === 3) {
              // Try DD-MM-YYYY or MM-DD-YYYY
              const d = parseInt(parts[0]);
              const m = parseInt(parts[1]);
              const y = parseInt(parts[2]);
              
              // Assume DD-MM-YYYY if day > 12
              if (d > 12) {
                const date = new Date(y, m - 1, d);
                if (!isNaN(date.getTime())) {
                  return date.toISOString().split('T')[0];
                }
              } else {
                // Try MM-DD-YYYY
                const date = new Date(y, d - 1, m);
                if (!isNaN(date.getTime())) {
                  return date.toISOString().split('T')[0];
                }
              }
            }
          }
          return dateStr;
        }
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  extractItems(lines) {
    const items = [];
    
    // Multiple patterns to catch different table formats
    const patterns = [
      // Pattern 1: Item Qty Rate Amount
      /(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/,
      // Pattern 2: With currency symbols
      /(.+?)\s+(\d+(?:\.\d+)?)\s+[₹$€£]?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s+[₹$€£]?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/,
      // Pattern 3: Spaced out numbers
      /(.+?)\s{2,}(\d+(?:\.\d+)?)\s{2,}(\d+(?:\.\d+)?)\s{2,}(\d+(?:\.\d+)?)/,
    ];
    
    let inItemsSection = false;
    let itemStartIndex = -1;
    
    // Find items section
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect start of items section
      if (/(?:Item|Description|Product|Particulars|S\.?\s*No\.?)/i.test(line)) {
        inItemsSection = true;
        itemStartIndex = i;
        continue;
      }

      // Detect end of items section
      if (/(?:Sub\s*total|Total|Tax|Discount|Amount\s*Due)/i.test(line)) {
        inItemsSection = false;
      }

      if (inItemsSection && i > itemStartIndex) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            const itemName = match[1].trim();
            const qty = parseFloat(match[2]);
            const rate = parseFloat(match[3].replace(/,/g, ''));
            const amount = parseFloat(match[4].replace(/,/g, ''));

            // Validation: amount should be close to qty * rate
            const calculatedAmount = qty * rate;
            const tolerance = Math.max(calculatedAmount * 0.1, 1); // 10% tolerance
            
            if (
              itemName.length > 1 &&
              !isNaN(qty) && qty > 0 &&
              !isNaN(rate) && rate > 0 &&
              !isNaN(amount) && amount > 0 &&
              (Math.abs(amount - calculatedAmount) < tolerance || amount >= rate)
            ) {
              items.push({
                itemName,
                itemCode: this.generateItemCode(itemName),
                qty,
                rate,
                amount,
              });
              break; // Found valid item, move to next line
            }
          }
        }
      }
    }

    return items;
  }

  generateItemCode(itemName) {
    const code = itemName
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .slice(0, 3)
      .map(word => word.substring(0, 3).toUpperCase())
      .join('');
    return code || 'ITEM';
  }

  extractTotals(lines) {
    const totals = {
      subtotal: 0,
      tax: 0,
      grandTotal: 0,
    };

    const patterns = {
      subtotal: /(?:Sub\s*total|Net\s*Amount)[:\s]*[₹$€£]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      tax: /(?:Tax|GST|VAT)[:\s]*[₹$€£]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
      grandTotal: /(?:Grand\s*Total|Total\s*Amount|Amount\s*Due|Total)[:\s]*[₹$€£]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
    };

    // Check last 20 lines for totals
    const relevantLines = lines.slice(-20);
    
    for (const line of relevantLines) {
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = line.match(pattern);
        if (match) {
          const value = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(value)) {
            totals[key] = value;
          }
        }
      }
    }

    return totals;
  }

  normalizeToFrappe(invoiceData) {
    const frappeInvoice = {
      doctype: 'Sales Invoice',
      party: invoiceData.party,
      party_name: invoiceData.party,
      posting_date: invoiceData.date,
      due_date: invoiceData.date,
      invoice_number: invoiceData.invoiceNumber,
      items: [],
      total: invoiceData.totals.subtotal || 0,
      grand_total: invoiceData.totals.grandTotal || 0,
    };

    // Normalize items
    for (const item of invoiceData.items) {
      frappeInvoice.items.push({
        item_code: item.itemCode,
        item_name: item.itemName,
        qty: item.qty,
        rate: item.rate,
        amount: item.amount,
        uom: 'Nos',
      });
    }

    // Calculate totals from items if not found in OCR
    if (frappeInvoice.total === 0 && frappeInvoice.items.length > 0) {
      frappeInvoice.total = frappeInvoice.items.reduce(
        (sum, item) => sum + item.amount,
        0
      );
    }
    
    if (frappeInvoice.grand_total === 0 && frappeInvoice.total > 0) {
      frappeInvoice.grand_total = frappeInvoice.total;
    }

    return frappeInvoice;
  }

  async processInvoice(imageFile) {
    try {
      // Step 1: Extract text
      const rawText = await this.extractText(imageFile);

      // Step 2: Parse invoice data
      console.log('Parsing invoice data...');
      const invoiceData = this.parseInvoice(rawText);

      // Step 3: Normalize to Frappe structure
      console.log('Normalizing to Frappe format...');
      const frappeInvoice = this.normalizeToFrappe(invoiceData);

      return frappeInvoice;
    } catch (error) {
      console.error('Error processing invoice:', error);
      throw error;
    }
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export default InvoiceOCRParser;