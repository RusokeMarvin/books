<!-- src/pages/OCRInvoice/OCRInvoice.vue -->
<template>
  <div class="flex flex-col h-full bg-gray-50">
    <!-- Header -->
    <PageHeader>
      <h1 class="text-2xl font-semibold">{{ t`OCR Invoice Processing` }}</h1>
      <template #actions>
        <Button
          v-if="processedInvoice"
          @click="clearInvoice"
          :icon="true"
          class="text-gray-600 hover:text-gray-900"
        >
          <feather-icon name="x" class="w-4 h-4" />
          {{ t`Clear` }}
        </Button>
      </template>
    </PageHeader>

    <div class="flex-1 overflow-auto p-6">
      <div class="max-w-7xl mx-auto">
        <!-- Upload Section -->
        <div v-if="!imagePreview" class="mb-6">
          <div
            @drop.prevent="handleDrop"
            @dragover.prevent
            @dragenter="isDragging = true"
            @dragleave="isDragging = false"
            :class="[
              'border-2 border-dashed rounded-lg p-12 text-center transition-colors',
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            ]"
          >
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              @change="handleFileSelect"
              class="hidden"
            />
            
            <feather-icon name="upload" class="w-12 h-12 mx-auto mb-4 text-gray-400" />
            
            <p class="text-lg font-medium text-gray-700 mb-2">
              {{ t`Drop invoice image here or click to upload` }}
            </p>
            <p class="text-sm text-gray-500 mb-4">
              {{ t`Supports JPG, PNG, PDF` }}
            </p>
            
            <Button @click="($refs.fileInput as HTMLInputElement).click()" type="primary">
              <feather-icon name="upload" class="w-4 h-4 mr-2" />
              {{ t`Select Image` }}
            </Button>
          </div>
        </div>

        <!-- Processing View -->
        <div v-if="imagePreview" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Left: Image Preview -->
          <div class="bg-white rounded-lg shadow p-4">
            <h3 class="text-lg font-semibold mb-4">{{ t`Invoice Image` }}</h3>
            <div class="relative border rounded overflow-hidden">
              <img :src="imagePreview" alt="Invoice" class="w-full" />
              
              <!-- Processing Overlay -->
              <div
                v-if="isProcessing"
                class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center"
              >
                <div class="text-center text-white">
                  <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p class="text-sm">{{ processingStatus }}</p>
                </div>
              </div>
            </div>
            
            <div class="mt-4 flex gap-2">
              <Button @click="processImage" :disabled="isProcessing" type="primary" class="flex-1">
                <feather-icon name="cpu" class="w-4 h-4 mr-2" />
                {{ isProcessing ? t`Processing...` : t`Process Invoice` }}
              </Button>
              <Button @click="clearInvoice" :icon="true">
                <feather-icon name="trash-2" class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <!-- Right: Extracted Data -->
          <div class="bg-white rounded-lg shadow p-4">
            <h3 class="text-lg font-semibold mb-4">{{ t`Extracted Data` }}</h3>
            
            <div v-if="!processedInvoice && !isProcessing" class="text-center py-12 text-gray-400">
              <feather-icon name="file-text" class="w-16 h-16 mx-auto mb-4" />
              <p>{{ t`Click "Process Invoice" to extract data` }}</p>
            </div>

            <div v-if="processedInvoice" class="space-y-4">
              <!-- Confidence Indicator -->
              <div v-if="lowConfidenceFields.length > 0" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div class="flex items-start">
                  <feather-icon name="alert-triangle" class="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div class="flex-1">
                    <p class="text-sm font-medium text-yellow-800">
                      {{ t`Low confidence fields - please review` }}
                    </p>
                    <p class="text-xs text-yellow-700 mt-1">
                      {{ lowConfidenceFields.join(', ') }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Invoice Header -->
              <div class="grid grid-cols-2 gap-4">
                <FormControl
                  :df="{ label: t`Customer`, fieldname: 'party', fieldtype: 'Link', target: 'Party' }"
                  :value="processedInvoice.party"
                  @change="(value: string) => updateField('party', value)"
                  :border="true"
                />
                <FormControl
                  :df="{ label: t`Invoice Number`, fieldname: 'invoice_number', fieldtype: 'Data' }"
                  :value="processedInvoice.invoice_number"
                  @change="(value: string) => updateField('invoice_number', value)"
                  :border="true"
                />
                <FormControl
                  :df="{ label: t`Date`, fieldname: 'posting_date', fieldtype: 'Date' }"
                  :value="processedInvoice.posting_date"
                  @change="(value: string) => updateField('posting_date', value)"
                  :border="true"
                />
                <FormControl
                  :df="{ label: t`Due Date`, fieldname: 'due_date', fieldtype: 'Date' }"
                  :value="processedInvoice.due_date"
                  @change="(value: string) => updateField('due_date', value)"
                  :border="true"
                />
              </div>

              <!-- Items Table -->
              <div class="border rounded-lg overflow-hidden">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {{ t`Item` }}
                      </th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">
                        {{ t`Qty` }}
                      </th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                        {{ t`Rate` }}
                      </th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">
                        {{ t`Amount` }}
                      </th>
                      <th class="w-10"></th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="(item, index) in processedInvoice.items" :key="index">
                      <td class="px-4 py-2">
                        <FormControl
                          :df="{ 
                            label: '', 
                            fieldname: 'item', 
                            fieldtype: 'Link', 
                            target: 'Item',
                            placeholder: t`Select or type item name`
                          }"
                          :value="item.item_name"
                          @change="(value: string) => updateItemName(index, value)"
                          :border="true"
                          size="small"
                        />
                      </td>
                      <td class="px-4 py-2">
                        <input
                          v-model.number="item.qty"
                          type="number"
                          step="0.01"
                          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          @input="updateItemAmount(index)"
                        />
                      </td>
                      <td class="px-4 py-2">
                        <input
                          v-model.number="item.rate"
                          type="number"
                          step="0.01"
                          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          @input="updateItemAmount(index)"
                        />
                      </td>
                      <td class="px-4 py-2">
                        <input
                          v-model.number="item.amount"
                          type="number"
                          step="0.01"
                          class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          readonly
                        />
                      </td>
                      <td class="px-2 py-2">
                        <button
                          @click="removeItem(index)"
                          class="text-red-500 hover:text-red-700"
                        >
                          <feather-icon name="x" class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                  <tfoot class="bg-gray-50">
                    <tr>
                      <td colspan="3" class="px-4 py-2 text-right font-semibold">
                        {{ t`Total` }}
                      </td>
                      <td class="px-4 py-2 font-semibold">
                        {{ fyo.format(processedInvoice.grand_total, 'Currency') }}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3 pt-4">
                <Button @click="createInvoice" type="primary" class="flex-1">
                  <feather-icon name="check" class="w-4 h-4 mr-2" />
                  {{ t`Create Sales Invoice` }}
                </Button>
                <Button @click="saveAsDraft" class="flex-1">
                  <feather-icon name="save" class="w-4 h-4 mr-2" />
                  {{ t`Save as Draft` }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { t } from 'fyo';
import { fyo } from 'src/initFyo';
import PageHeader from 'src/components/PageHeader.vue';
import Button from 'src/components/Button.vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import { showToast } from 'src/utils/interactive';
import { Invoice } from 'models/baseModels/Invoice/Invoice';

// Import the OCR parser
import InvoiceOCRParser from './OCRParser';

interface InvoiceItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
  uom: string;
}

interface ProcessedInvoice {
  party: string;
  party_name: string;
  posting_date: string;
  due_date: string;
  invoice_number: string;
  items: InvoiceItem[];
  total: number;
  grand_total: number;
}

export default defineComponent({
  name: 'OCRInvoice',
  components: {
    PageHeader,
    Button,
    FormControl,
  },
  data() {
    return {
      imageFile: null as File | null,
      imagePreview: null as string | null,
      isProcessing: false,
      processingStatus: '',
      processedInvoice: null as ProcessedInvoice | null,
      isDragging: false,
      lowConfidenceFields: [] as string[],
      parser: null as any,
    };
  },
  setup() {
    return {
      fileInput: null as HTMLInputElement | null,
    };
  },
  computed: {
    fyo() {
      return fyo;
    },
    t() {
      return t;
    },
  },
  mounted() {
    // Initialize OCR parser
    this.parser = new InvoiceOCRParser();
  },
  beforeUnmount() {
    // Cleanup
    if (this.parser) {
      this.parser.cleanup();
    }
  },
  methods: {
    handleFileSelect(event: Event) {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        this.loadImage(file);
      }
    },
    handleDrop(event: DragEvent) {
      this.isDragging = false;
      const file = event.dataTransfer?.files[0];
      if (file && file.type.startsWith('image/')) {
        this.loadImage(file);
      } else {
        showToast({
          type: 'error',
          message: t`Please upload a valid image file`,
        });
      }
    },
    loadImage(file: File) {
      this.imageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    async processImage() {
      if (!this.imageFile) return;

      this.isProcessing = true;
      this.processingStatus = t`Extracting text from image...`;

      try {
        // Create a temporary file path for the parser
        const result = await this.parser.processInvoice(this.imageFile);
        
        this.processingStatus = t`Processing invoice data...`;
        
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        this.processedInvoice = result;
        this.lowConfidenceFields = this.identifyLowConfidenceFields(result);

        showToast({
          type: 'success',
          message: t`Invoice processed successfully`,
        });
      } catch (error) {
        console.error('OCR processing error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          type: 'error',
          message: t`Failed to process invoice: ${errorMessage}`,
        });
      } finally {
        this.isProcessing = false;
        this.processingStatus = '';
      }
    },
    identifyLowConfidenceFields(invoice: ProcessedInvoice): string[] {
      const fields: string[] = [];
      
      if (!invoice.party || invoice.party.length < 3) {
        fields.push('Customer');
      }
      if (!invoice.invoice_number) {
        fields.push('Invoice Number');
      }
      if (!invoice.posting_date) {
        fields.push('Date');
      }
      if (invoice.items.length === 0) {
        fields.push('Items');
      }
      
      return fields;
    },
    updateField(fieldname: string, value: any) {
      if (this.processedInvoice) {
        (this.processedInvoice as any)[fieldname] = value;
      }
    },
    updateItemName(index: number, value: string) {
      if (this.processedInvoice) {
        this.processedInvoice.items[index].item_name = value;
        // Optionally update item_code based on the selected item
        // You could fetch item details here if needed
      }
    },
    updateItemAmount(index: number) {
      if (this.processedInvoice) {
        const item = this.processedInvoice.items[index];
        item.amount = item.qty * item.rate;
        this.updateGrandTotal();
      }
    },
    updateGrandTotal() {
      if (this.processedInvoice) {
        this.processedInvoice.grand_total = this.processedInvoice.items.reduce(
          (sum, item) => sum + item.amount,
          0
        );
        this.processedInvoice.total = this.processedInvoice.grand_total;
      }
    },
    removeItem(index: number) {
      if (this.processedInvoice) {
        this.processedInvoice.items.splice(index, 1);
        this.updateGrandTotal();
      }
    },
    async createInvoice() {
      if (!this.processedInvoice) return;

      try {
        // Create new Sales Invoice
        const doc = fyo.doc.getNewDoc('SalesInvoice') as Invoice;
        
        await doc.set('party', this.processedInvoice.party);
        await doc.set('date', this.processedInvoice.posting_date);
        
        // Add items
        for (const item of this.processedInvoice.items) {
          await doc.append('items', {
            item: item.item_name,
            quantity: item.qty,
            rate: item.rate,
          });
        }

        // Save the invoice
        await doc.sync();
        
        showToast({
          type: 'success',
          message: t`Sales Invoice created successfully`,
        });

        // Navigate to the created invoice
        this.$router.push(`/edit/SalesInvoice/${doc.name}`);
      } catch (error) {
        console.error('Error creating invoice:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        showToast({
          type: 'error',
          message: t`Failed to create invoice: ${errorMessage}`,
        });
      }
    },
    async saveAsDraft() {
      if (!this.processedInvoice) return;

      try {
        // Save to localStorage or IndexedDB for later
        const draftKey = `ocr_draft_${Date.now()}`;
        localStorage.setItem(draftKey, JSON.stringify(this.processedInvoice));
        
        showToast({
          type: 'success',
          message: t`Draft saved successfully`,
        });
      } catch (error) {
        console.error('Error saving draft:', error);
        showToast({
          type: 'error',
          message: t`Failed to save draft`,
        });
      }
    },
    clearInvoice() {
      this.imageFile = null;
      this.imagePreview = null;
      this.processedInvoice = null;
      this.lowConfidenceFields = [];
    },
  },
});
</script>

<style scoped>
/* Add any custom styles here */
</style>