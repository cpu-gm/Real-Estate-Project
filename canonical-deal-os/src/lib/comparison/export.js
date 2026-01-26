import { METRICS_ORDER, METRICS_CONFIG, formatValue, extractValue } from "./metrics";

/**
 * Export comparison data to CSV and trigger download
 */
export function exportToCSV(deals) {
  // Build header row with deal names
  const dealNames = deals.map(deal => {
    const dealData = deal.distribution?.dealDraft ?? deal;
    return dealData.propertyName || "Untitled";
  });
  const headers = ["Metric", ...dealNames];

  // Build data rows
  const rows = METRICS_ORDER.map(metricKey => {
    const config = METRICS_CONFIG[metricKey];
    const values = deals.map(deal => {
      const value = extractValue(deal, metricKey);
      return formatValue(value, config.format);
    });
    return [config.label, ...values];
  });

  // Convert to CSV string
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // Create and trigger download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `deal-comparison-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export comparison view to PDF using html2canvas and jspdf
 */
export async function exportToPDF(elementRef, deals) {
  const jsPDF = (await import("jspdf")).default;
  const html2canvas = (await import("html2canvas")).default;

  const element = elementRef.current;
  if (!element) {
    throw new Error("Element ref not found");
  }

  // Capture the element as canvas
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff"
  });

  const imgData = canvas.toDataURL("image/png");

  // Calculate dimensions for landscape PDF
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = imgWidth / imgHeight;

  // Use landscape A4
  const pdfWidth = 297; // A4 landscape width in mm
  const pdfHeight = 210; // A4 landscape height in mm

  let finalWidth = pdfWidth - 20; // 10mm margins
  let finalHeight = finalWidth / ratio;

  // If too tall, scale down
  if (finalHeight > pdfHeight - 20) {
    finalHeight = pdfHeight - 20;
    finalWidth = finalHeight * ratio;
  }

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  // Center the image
  const x = (pdfWidth - finalWidth) / 2;
  const y = (pdfHeight - finalHeight) / 2;

  pdf.addImage(imgData, "PNG", x, y, finalWidth, finalHeight);

  // Generate filename
  const dealCount = deals.length;
  const filename = `deal-comparison-${dealCount}-deals-${new Date().toISOString().split("T")[0]}.pdf`;
  pdf.save(filename);
}
