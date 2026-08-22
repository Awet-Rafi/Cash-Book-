import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Product, StockMovement } from '../types';
import { formatCurrency } from './utils';

export interface MovementWithBalance extends StockMovement {
  runningBalance?: number;
}

/**
 * Export Stock Movements to PDF (Overall or Item-Specific)
 */
export function exportStockMovementsPDF(
  movements: MovementWithBalance[],
  options: {
    title: string;
    product?: Product | null;
    products?: Product[];
    businessName?: string | null;
    subtitle?: string;
  }
) {
  // Use landscape for full ledger view so columns like Total Selling Value fit cleanly
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dateStr = format(new Date(), 'dd MMM, yyyy hh:mm a');
  const bName = options.businessName || 'Business';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Title Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59); // dark slate
  doc.text(options.title, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Business: ${bName}   |   Generated: ${dateStr}`, 14, 22);

  let startY = 28;

  // Item details block if exporting for a specific product
  if (options.product) {
    const p = options.product;
    const totalSellingVal = (p.price || 0) * (p.stockQuantity || 0);
    const totalCostVal = (p.costPrice || 0) * (p.stockQuantity || 0);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, startY, pageWidth - 28, 20, 2, 2, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Product: ${p.name}`, 18, startY + 7);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Category: ${p.category || 'Standard'}   |   Current Stock: ${p.stockQuantity}   |   Unit Selling Price: ${formatCurrency(p.price)}   |   Total Selling Value: ${formatCurrency(totalSellingVal)}   |   Unit Cost Price: ${formatCurrency(p.costPrice)}   |   Total Cost Value: ${formatCurrency(totalCostVal)}`,
      18,
      startY + 14
    );

    startY += 26;
  } else if (options.subtitle) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(options.subtitle, 14, startY);
    startY += 6;
  }

  // Define Table Columns
  const showProductCol = !options.product;
  const head = showProductCol
    ? [['Date & Time', 'Product Name', 'Type', 'Mode / Ref', 'Notes / Customer', 'Qty Change', 'Unit Selling Price', 'Total Selling Value', 'Balance']]
    : [['Date & Time', 'Movement Type', 'Mode / Ref', 'Notes / Customer', 'Qty Change', 'Unit Selling Price', 'Total Selling Value', 'Balance']];

  // Helper product lookup map
  const productMap = new Map<string, Product>();
  if (options.products) {
    options.products.forEach((p) => productMap.set(p.id, p));
  }
  if (options.product) {
    productMap.set(options.product.id, options.product);
  }

  let totalSellingSum = 0;
  let totalQtyChange = 0;

  const tableRows = movements.map((m) => {
    const formattedDate = m.timestamp
      ? format(new Date(m.timestamp), 'dd MMM, yyyy hh:mm a')
      : 'N/A';
    const typeLabel =
      m.type === 'edit_sale'
        ? 'Sale Modified'
        : m.type.replace('_', ' ').charAt(0).toUpperCase() + m.type.replace('_', ' ').slice(1);
    
    const modeLabel = m.type === 'sale' ? (m.paymentMethod === 'credit' ? 'Credit Sale' : 'Cash Sale') : (m.type === 'restock' ? 'Restock In' : 'Stock Adjustment');
    const notesLabel = [
      m.customerName ? `Cust: ${m.customerName}` : '',
      m.notes || ''
    ].filter(Boolean).join(' - ') || '-';

    const prod = productMap.get(m.productId) || options.product;
    const unitPrice = prod?.price ?? 0;
    const itemTotalSelling = m.amount && m.amount > 0 ? m.amount : Math.abs(m.quantity) * unitPrice;

    totalSellingSum += itemTotalSelling;
    totalQtyChange += m.quantity;

    const qtyText = (m.quantity > 0 ? '+' : '') + m.quantity;
    const unitPriceText = formatCurrency(unitPrice);
    const totalSellingText = formatCurrency(itemTotalSelling);
    const balanceText = m.runningBalance !== undefined ? m.runningBalance.toString() : '-';

    if (showProductCol) {
      return [
        formattedDate,
        m.productName || prod?.name || 'Unknown Product',
        typeLabel,
        modeLabel,
        notesLabel,
        qtyText,
        unitPriceText,
        totalSellingText,
        balanceText
      ];
    } else {
      return [
        formattedDate,
        typeLabel,
        modeLabel,
        notesLabel,
        qtyText,
        unitPriceText,
        totalSellingText,
        balanceText
      ];
    }
  });

  // Add summary / total row
  if (tableRows.length > 0) {
    if (showProductCol) {
      tableRows.push([
        'TOTAL',
        '',
        '',
        '',
        `${movements.length} records`,
        (totalQtyChange > 0 ? '+' : '') + totalQtyChange,
        '',
        formatCurrency(totalSellingSum),
        ''
      ]);
    } else {
      tableRows.push([
        'TOTAL',
        '',
        '',
        `${movements.length} records`,
        (totalQtyChange > 0 ? '+' : '') + totalQtyChange,
        '',
        formatCurrency(totalSellingSum),
        ''
      ]);
    }
  }

  autoTable(doc, {
    startY: startY,
    head: head,
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229], // Indigo 600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: showProductCol
      ? {
          0: { cellWidth: 36 },
          1: { cellWidth: 42 },
          2: { cellWidth: 24 },
          3: { cellWidth: 26 },
          4: { cellWidth: 45 },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 26, halign: 'right' },
          7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 18, halign: 'right' },
        }
      : {
          0: { cellWidth: 40 },
          1: { cellWidth: 30 },
          2: { cellWidth: 32 },
          3: { cellWidth: 65 },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
          7: { cellWidth: 18, halign: 'right' },
        },
    didParseCell: (data) => {
      // Highlight the total row
      if (data.row.index === tableRows.length - 1 && tableRows.length > 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - 30,
        pageHeight - 8
      );
      doc.text(
        `Generated by ${bName} Inventory Management`,
        14,
        pageHeight - 8
      );
    },
  });

  const safeFileName = (options.product ? options.product.name : 'Stock_Movements')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeFileName}_Stock_Movements_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}

/**
 * Export Stock Movements to Excel (Overall or Item-Specific)
 */
export function exportStockMovementsExcel(
  movements: MovementWithBalance[],
  options: {
    title: string;
    product?: Product | null;
    products?: Product[];
    businessName?: string | null;
  }
) {
  const dateStr = format(new Date(), 'dd MMM, yyyy hh:mm a');
  const bName = options.businessName || 'Business';

  const rows: (string | number)[][] = [
    [options.title],
    ['Business Name:', bName],
    ['Date Generated:', dateStr],
  ];

  if (options.product) {
    const p = options.product;
    rows.push(
      ['Product Name:', p.name],
      ['Category:', p.category || 'Standard'],
      ['Current Stock Quantity:', p.stockQuantity],
      ['Unit Selling Price (USD):', p.price],
      ['Total Current Selling Value (USD):', p.price * p.stockQuantity],
      ['Unit Cost Price (USD):', p.costPrice],
      ['Total Current Cost Value (USD):', p.costPrice * p.stockQuantity]
    );
  }

  rows.push([]); // Empty spacing row

  // Table Headers with "Unit Selling Price" and "Total Selling Value"
  const headers = [
    'Date & Time',
    'Product Name',
    'Movement Type',
    'Mode / Payment Method',
    'Customer Name',
    'Notes',
    'Quantity Change',
    'Unit Selling Price (USD)',
    'Total Selling Value (USD)',
    'Running Balance',
  ];
  rows.push(headers);

  // Helper product lookup map
  const productMap = new Map<string, Product>();
  if (options.products) {
    options.products.forEach((p) => productMap.set(p.id, p));
  }
  if (options.product) {
    productMap.set(options.product.id, options.product);
  }

  let totalSellingSum = 0;
  let totalQty = 0;

  // Table Data
  movements.forEach((m) => {
    const formattedDate = m.timestamp
      ? format(new Date(m.timestamp), 'yyyy-MM-dd HH:mm:ss')
      : 'N/A';
    const typeLabel =
      m.type === 'edit_sale'
        ? 'Sale Modified'
        : m.type.replace('_', ' ').charAt(0).toUpperCase() + m.type.replace('_', ' ').slice(1);

    const prod = productMap.get(m.productId) || options.product;
    const unitPrice = prod?.price ?? 0;
    const itemTotalSelling = m.amount && m.amount > 0 ? m.amount : Math.abs(m.quantity) * unitPrice;

    totalSellingSum += itemTotalSelling;
    totalQty += m.quantity;

    rows.push([
      formattedDate,
      m.productName || prod?.name || (options.product ? options.product.name : 'Unknown Product'),
      typeLabel,
      m.type === 'sale' ? (m.paymentMethod === 'credit' ? 'Credit Sale' : 'Cash Sale') : (m.type === 'restock' ? 'Restock In' : 'Stock Adjustment'),
      m.customerName || '',
      m.notes || '',
      m.quantity,
      unitPrice,
      itemTotalSelling,
      m.runningBalance !== undefined ? m.runningBalance : '',
    ]);
  });

  // Summary Row
  if (movements.length > 0) {
    rows.push([
      'TOTAL',
      '',
      '',
      '',
      '',
      `${movements.length} records`,
      totalQty,
      '',
      totalSellingSum,
      ''
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Column widths auto-calculation
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach((r) => {
      if (r[i] !== undefined && r[i] !== null) {
        maxLen = Math.max(maxLen, String(r[i]).length);
      }
    });
    return { wch: Math.min(Math.max(maxLen + 2, 14), 45) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Movements');

  const safeFileName = (options.product ? options.product.name : 'Stock_Movements')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(
    workbook,
    `${safeFileName}_Stock_Movements_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`
  );
}

/**
 * Export Current Stock Inventory Status to PDF
 */
export function exportStockStatusPDF(
  products: Product[],
  businessName?: string | null
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dateStr = format(new Date(), 'dd MMM, yyyy hh:mm a');
  const bName = businessName || 'Business';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('Inventory Stock Status Report', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Business: ${bName}   |   Generated: ${dateStr}`, 14, 22);

  const totalCostValue = products.reduce((sum, p) => sum + (p.costPrice || 0) * (p.stockQuantity || 0), 0);
  const totalSellingValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.stockQuantity || 0), 0);
  const totalQuantity = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
  const lowStockCount = products.filter((p) => p.stockQuantity <= 5 && p.stockQuantity > 0).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity <= 0).length;

  // Summary box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 26, pageWidth - 28, 16, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Total Products: ${products.length}   |   Total Units: ${totalQuantity}   |   Low Stock: ${lowStockCount}   |   Out of Stock: ${outOfStockCount}   |   Total Stock Cost: ${formatCurrency(totalCostValue)}   |   Total Selling Value: ${formatCurrency(totalSellingValue)}`,
    18,
    36
  );

  const head = [['#', 'Product Name', 'Category', 'Current Stock', 'Cost Price', 'Selling Price', 'Total Cost Value', 'Total Selling Value']];
  const body = products.map((p, idx) => [
    idx + 1,
    p.name,
    p.category || 'Standard',
    p.stockQuantity,
    formatCurrency(p.costPrice),
    formatCurrency(p.price),
    formatCurrency(p.costPrice * p.stockQuantity),
    formatCurrency(p.price * p.stockQuantity)
  ]);

  // Add Grand Total row
  if (body.length > 0) {
    body.push([
      'TOTAL',
      `${products.length} Products`,
      '',
      totalQuantity,
      '',
      '',
      formatCurrency(totalCostValue),
      formatCurrency(totalSellingValue)
    ]);
  }

  autoTable(doc, {
    startY: 46,
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 60 },
      2: { cellWidth: 35 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 38, halign: 'right' },
      7: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1 && body.length > 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth - 30,
        pageHeight - 8
      );
      doc.text(
        `Generated by ${bName} Inventory Management`,
        14,
        pageHeight - 8
      );
    }
  });

  doc.save(`Inventory_Stock_Status_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
}

/**
 * Export Current Stock Inventory Status to Excel
 */
export function exportStockStatusExcel(
  products: Product[],
  businessName?: string | null
) {
  const dateStr = format(new Date(), 'dd MMM, yyyy hh:mm a');
  const bName = businessName || 'Business';

  const totalCostValue = products.reduce((sum, p) => sum + (p.costPrice || 0) * (p.stockQuantity || 0), 0);
  const totalSellingValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.stockQuantity || 0), 0);
  const totalQuantity = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);

  const rows: (string | number)[][] = [
    ['Inventory Stock Status Report'],
    ['Business Name:', bName],
    ['Date Generated:', dateStr],
    ['Total Stock Units:', totalQuantity],
    ['Total Stock Cost Value (USD):', totalCostValue],
    ['Total Stock Selling Value (USD):', totalSellingValue],
    [],
    ['#', 'Product Name', 'Category', 'Current Stock Quantity', 'Cost Price (USD)', 'Selling Price (USD)', 'Total Stock Cost Value (USD)', 'Total Stock Selling Value (USD)']
  ];

  products.forEach((p, idx) => {
    rows.push([
      idx + 1,
      p.name,
      p.category || 'Standard',
      p.stockQuantity,
      p.costPrice,
      p.price,
      p.costPrice * p.stockQuantity,
      p.price * p.stockQuantity
    ]);
  });

  // Grand total row
  if (products.length > 0) {
    rows.push([
      'TOTAL',
      `${products.length} Products`,
      '',
      totalQuantity,
      '',
      '',
      totalCostValue,
      totalSellingValue
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  const headers = ['#', 'Product Name', 'Category', 'Current Stock Quantity', 'Cost Price (USD)', 'Selling Price (USD)', 'Total Stock Cost Value (USD)', 'Total Stock Selling Value (USD)'];
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.slice(7).forEach((r) => {
      if (r[i] !== undefined && r[i] !== null) {
        maxLen = Math.max(maxLen, String(r[i]).length);
      }
    });
    return { wch: Math.min(Math.max(maxLen + 2, 14), 40) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Status');

  XLSX.writeFile(
    workbook,
    `Inventory_Stock_Status_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`
  );
}
