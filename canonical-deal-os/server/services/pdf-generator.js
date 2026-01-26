/**
 * PDF Generation Service for Listing Agreements
 *
 * Generates professional listing agreement PDFs with:
 * - Property details
 * - Commission terms
 * - Agreement type and duration
 * - Confirmation signatures (checkbox-based for MVP)
 *
 * Note: For MVP, this generates a simple HTML-based PDF.
 * Future enhancement: Integrate with a PDF library like pdfkit or puppeteer.
 */

/**
 * Format currency for display
 */
function formatCurrency(amount) {
  if (!amount) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format percentage for display
 */
function formatPercent(rate) {
  if (!rate) return 'N/A';
  const num = parseFloat(rate);
  return (num * 100).toFixed(2) + '%';
}

/**
 * Format date for display
 */
function formatDate(date) {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Get agreement type description
 */
function getAgreementTypeDescription(type) {
  const descriptions = {
    EXCLUSIVE_RIGHT_TO_SELL: 'Exclusive Right to Sell - Broker has exclusive right to market and sell the property. Commission is earned regardless of who procures the buyer.',
    EXCLUSIVE_AGENCY: 'Exclusive Agency - Broker is the exclusive agent, but seller may sell property directly without paying commission.',
    OPEN_LISTING: 'Open Listing - Non-exclusive agreement. Commission only earned if broker procures the buyer.',
    NET_LISTING: 'Net Listing - Commission is the difference between sale price and agreed net amount to seller.'
  };
  return descriptions[type] || type;
}

/**
 * Generate HTML content for the listing agreement PDF
 */
export function generateListingAgreementHtml({
  dealDraft,
  agreement,
  sellerInfo,
  brokerInfo
}) {
  console.log('[PDFGenerator] Generating listing agreement HTML', { dealDraftId: dealDraft?.id });

  const priceDisplay = dealDraft?.askingPrice
    ? formatCurrency(dealDraft.askingPrice)
    : (dealDraft?.askingPriceMin && dealDraft?.askingPriceMax)
      ? `${formatCurrency(dealDraft.askingPriceMin)} - ${formatCurrency(dealDraft.askingPriceMax)}`
      : 'To be determined';

  const commissionDisplay = agreement?.commissionPercent
    ? `${agreement.commissionPercent}%`
    : agreement?.commissionFlat
      ? formatCurrency(agreement.commissionFlat)
      : 'As negotiated';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Listing Agreement - ${dealDraft?.propertyName || 'Property'}</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 1in;
      color: #333;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 18pt;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .header p {
      margin: 5px 0 0 0;
      font-size: 10pt;
      color: #666;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-weight: bold;
      font-size: 14pt;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
      margin-bottom: 15px;
    }
    .field-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .field-label {
      font-weight: bold;
      min-width: 200px;
    }
    .field-value {
      flex: 1;
      text-align: right;
    }
    .parties-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .party-box {
      border: 1px solid #ccc;
      padding: 15px;
      border-radius: 5px;
    }
    .party-title {
      font-weight: bold;
      margin-bottom: 10px;
      font-size: 12pt;
    }
    .terms-text {
      font-size: 11pt;
      text-align: justify;
    }
    .signature-section {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 50px;
      margin-top: 30px;
    }
    .signature-box {
      border-top: 1px solid #333;
      padding-top: 10px;
    }
    .signature-line {
      border-bottom: 1px solid #333;
      height: 40px;
      margin-bottom: 5px;
    }
    .signature-label {
      font-size: 10pt;
      color: #666;
    }
    .confirmation {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-top: 20px;
    }
    .confirmation-item {
      margin-bottom: 10px;
    }
    .footer {
      margin-top: 50px;
      font-size: 10pt;
      color: #666;
      text-align: center;
      border-top: 1px solid #ccc;
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Listing Agreement</h1>
    <p>Commercial Real Estate Listing Contract</p>
    <p>Agreement ID: ${agreement?.id || 'DRAFT'}</p>
  </div>

  <div class="section">
    <div class="section-title">Property Information</div>
    <div class="field-row">
      <span class="field-label">Property Name:</span>
      <span class="field-value">${dealDraft?.propertyName || 'Not specified'}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Property Address:</span>
      <span class="field-value">${dealDraft?.propertyAddress || 'Not specified'}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Asset Type:</span>
      <span class="field-value">${dealDraft?.assetType || 'Not specified'}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Listing Price:</span>
      <span class="field-value">${priceDisplay}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Parties to Agreement</div>
    <div class="parties-grid">
      <div class="party-box">
        <div class="party-title">SELLER</div>
        <div class="field-row">
          <span class="field-label">Name:</span>
          <span class="field-value">${sellerInfo?.name || 'Not specified'}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Entity:</span>
          <span class="field-value">${agreement?.sellerEntityName || sellerInfo?.entityName || 'Individual'}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Email:</span>
          <span class="field-value">${sellerInfo?.email || 'Not specified'}</span>
        </div>
      </div>
      <div class="party-box">
        <div class="party-title">BROKER</div>
        <div class="field-row">
          <span class="field-label">Name:</span>
          <span class="field-value">${brokerInfo?.name || 'Not specified'}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Firm:</span>
          <span class="field-value">${brokerInfo?.firmName || 'Independent'}</span>
        </div>
        <div class="field-row">
          <span class="field-label">Email:</span>
          <span class="field-value">${brokerInfo?.email || 'Not specified'}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Agreement Terms</div>
    <div class="field-row">
      <span class="field-label">Agreement Type:</span>
      <span class="field-value">${agreement?.agreementType?.replace(/_/g, ' ') || 'Not specified'}</span>
    </div>
    <p class="terms-text">${getAgreementTypeDescription(agreement?.agreementType)}</p>
    <div class="field-row">
      <span class="field-label">Commission:</span>
      <span class="field-value">${commissionDisplay}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Effective Date:</span>
      <span class="field-value">${formatDate(agreement?.termStartDate)}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Expiration Date:</span>
      <span class="field-value">${formatDate(agreement?.termEndDate)}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Standard Terms and Conditions</div>
    <p class="terms-text">
      1. <strong>Marketing Authorization:</strong> Seller authorizes Broker to market the Property using
      commercially reasonable methods, including but not limited to listing on commercial real estate
      platforms, distribution to qualified buyers, and preparation of marketing materials.
    </p>
    <p class="terms-text">
      2. <strong>Cooperation:</strong> Seller agrees to cooperate with Broker in showing the Property
      and providing necessary documentation for qualified buyers.
    </p>
    <p class="terms-text">
      3. <strong>Commission Payment:</strong> Commission shall be due and payable upon the closing of
      a sale or lease transaction, as applicable to the agreement type specified above.
    </p>
    <p class="terms-text">
      4. <strong>Confidentiality:</strong> Both parties agree to maintain confidentiality regarding
      proprietary information shared during the listing period.
    </p>
  </div>

  <div class="signature-section">
    <div class="section-title">Electronic Confirmation</div>
    <div class="confirmation">
      <div class="confirmation-item">
        <strong>Seller Confirmation:</strong>
        ${agreement?.sellerConfirmedAt
          ? `Confirmed on ${formatDate(agreement.sellerConfirmedAt)} from IP ${agreement.sellerConfirmedIp || 'N/A'}`
          : 'Pending'}
      </div>
      <div class="confirmation-item">
        <strong>Broker Confirmation:</strong>
        ${agreement?.brokerConfirmedAt
          ? `Confirmed on ${formatDate(agreement.brokerConfirmedAt)} from IP ${agreement.brokerConfirmedIp || 'N/A'}`
          : 'Pending'}
      </div>
    </div>
    <p style="font-size: 10pt; margin-top: 15px;">
      By electronically confirming this agreement, both parties acknowledge that they have read,
      understand, and agree to be bound by the terms set forth herein. This electronic confirmation
      constitutes a valid signature under the Electronic Signatures in Global and National Commerce
      Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA).
    </p>
  </div>

  <div class="footer">
    <p>Generated by Canonical Deal OS</p>
    <p>Document ID: ${agreement?.id || 'DRAFT-' + Date.now()}</p>
    <p>Generated: ${formatDate(new Date())}</p>
  </div>
</body>
</html>
  `.trim();

  return html;
}

/**
 * Generate a listing agreement PDF
 *
 * For MVP: Returns HTML that can be converted to PDF client-side or via a service.
 * Future: Integrate with puppeteer or pdfkit for server-side PDF generation.
 */
export async function generateListingAgreementPdf({
  dealDraft,
  agreement,
  sellerInfo,
  brokerInfo
}) {
  console.log('[PDFGenerator] Generating listing agreement', { dealDraftId: dealDraft?.id });

  try {
    const html = generateListingAgreementHtml({
      dealDraft,
      agreement,
      sellerInfo,
      brokerInfo
    });

    // For MVP, return the HTML content
    // In production, this would:
    // 1. Use puppeteer to render HTML to PDF
    // 2. Upload PDF to cloud storage (S3, etc.)
    // 3. Return the URL

    // Placeholder for PDF URL
    const pdfUrl = null; // Would be set after actual PDF generation and upload

    console.log('[PDFGenerator] HTML generated successfully', {
      dealDraftId: dealDraft?.id,
      htmlLength: html.length
    });

    return {
      html,
      pdfUrl,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[PDFGenerator] Error generating PDF', { error: error.message });
    throw error;
  }
}

export default {
  generateListingAgreementPdf,
  generateListingAgreementHtml
};
