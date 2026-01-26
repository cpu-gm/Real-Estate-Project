/**
 * Onboarding Extractor Service
 *
 * Extracts claims from documents during organization onboarding.
 * Extends the deal-claim-extractor patterns for bulk import scenarios.
 *
 * Key differences from deal-claim-extractor:
 * 1. Works with OnboardingSession, OnboardingIntakeSource, OnboardingClaim
 * 2. Supports multiple record types (Deal, Contact, Property, LP)
 * 3. Uses OnboardingLogger for correlation tracking
 * 4. Handles higher volume with batch processing
 * 5. Discovers data links between extracted records
 */

import { getPrisma } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { createOnboardingLogger, COMPONENTS } from './onboarding-logger.js';

// OpenAI configuration
const OPENAI_API_KEY = process.env.BFF_OPENAI_API_KEY;
const OPENAI_MODEL = process.env.BFF_OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.BFF_OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Extraction prompts by category
const ONBOARDING_PROMPTS = {
  DEAL: `Extract deal/property investment information from this document.
Return ONLY a JSON object with multiple records if present:

{
  "records": [
    {
      "recordKey": "unique identifier for this deal",
      "recordTitle": "property name or deal name",
      "fields": {
        "propertyName": "string",
        "propertyAddress": "string - full address",
        "city": "string",
        "state": "string - 2 letter code",
        "zipCode": "string",
        "assetType": "MULTIFAMILY|OFFICE|RETAIL|INDUSTRIAL|HOSPITALITY|MIXED_USE|LAND|SELF_STORAGE|SENIOR_HOUSING|OTHER",
        "unitCount": number or null,
        "totalSF": number or null,
        "yearBuilt": number or null,
        "askingPrice": number or null,
        "purchasePrice": number or null,
        "closingDate": "YYYY-MM-DD or null",
        "currentNOI": number or null,
        "capRate": number (decimal 0.0-1.0) or null,
        "occupancy": number (decimal 0.0-1.0) or null,
        "status": "ACTIVE|UNDER_CONTRACT|CLOSED|DEAD or null",
        "investmentType": "ACQUISITION|DISPOSITION|REFINANCE|DEVELOPMENT or null"
      },
      "metadata": {
        "fieldName": {
          "confidence": number 0.0-1.0,
          "pageNumber": number or null,
          "textSnippet": "source text (max 200 chars)"
        }
      }
    }
  ]
}

Extract ALL deals/properties found in the document. Use unique recordKey for each.`,

  CONTACT: `Extract contact/person information from this document.
Return ONLY a JSON object with multiple records if present:

{
  "records": [
    {
      "recordKey": "unique identifier (email or name-based)",
      "recordTitle": "person's full name",
      "fields": {
        "fullName": "string",
        "firstName": "string or null",
        "lastName": "string or null",
        "email": "string or null",
        "phone": "string or null",
        "company": "string or null",
        "title": "string (job title) or null",
        "contactType": "BROKER|INVESTOR|LENDER|ATTORNEY|VENDOR|OWNER|SELLER|BUYER|OTHER or null",
        "linkedDeals": ["array of deal names/addresses this contact is associated with"],
        "notes": "string or null"
      },
      "metadata": {
        "fieldName": {
          "confidence": number 0.0-1.0,
          "location": "cell reference or description",
          "textSnippet": "source text"
        }
      }
    }
  ]
}

Extract ALL contacts found in the document.`,

  LP_RECORD: `Extract LP (Limited Partner) investor information from this document.
Return ONLY a JSON object with multiple records if present:

{
  "records": [
    {
      "recordKey": "unique identifier",
      "recordTitle": "investor/entity name",
      "fields": {
        "investorName": "string - individual or entity name",
        "entityType": "INDIVIDUAL|LLC|LP|TRUST|IRA|401K|CORPORATION|OTHER or null",
        "email": "string or null",
        "phone": "string or null",
        "address": "string or null",
        "committedCapital": number or null,
        "fundedCapital": number or null,
        "ownershipPercentage": number (decimal 0.0-1.0) or null,
        "dealName": "string - deal/fund this investment is in",
        "investmentDate": "YYYY-MM-DD or null",
        "distributionsReceived": number or null,
        "preferredReturn": number (decimal) or null,
        "accreditationStatus": "ACCREDITED|NON_ACCREDITED|UNKNOWN or null"
      },
      "metadata": {
        "fieldName": {
          "confidence": number 0.0-1.0,
          "location": "cell reference",
          "textSnippet": "source text"
        }
      }
    }
  ]
}

Extract ALL LP/investor records found in the document.`,

  PROPERTY: `Extract property/asset information from this document.
Return ONLY a JSON object with multiple records if present:

{
  "records": [
    {
      "recordKey": "unique identifier",
      "recordTitle": "property name",
      "fields": {
        "propertyName": "string",
        "address": "string - full address",
        "city": "string",
        "state": "string - 2 letter code",
        "zipCode": "string",
        "propertyType": "MULTIFAMILY|OFFICE|RETAIL|INDUSTRIAL|HOSPITALITY|MIXED_USE|LAND|SELF_STORAGE|OTHER",
        "unitCount": number or null,
        "buildingSF": number or null,
        "landSF": number or null,
        "yearBuilt": number or null,
        "yearRenovated": number or null,
        "stories": number or null,
        "parkingSpaces": number or null,
        "occupancy": number (decimal) or null,
        "averageRent": number or null,
        "currentNOI": number or null,
        "marketValue": number or null,
        "loanBalance": number or null
      },
      "metadata": {
        "fieldName": {
          "confidence": number 0.0-1.0,
          "pageNumber": number or null,
          "textSnippet": "source text"
        }
      }
    }
  ]
}

Extract ALL properties found in the document.`,

  DOCUMENT: `Analyze this document and determine what type of CRE document it is.
Return ONLY a JSON object:

{
  "documentType": "OM|RENT_ROLL|T12|LOI|PSA|LOAN_DOC|APPRAISAL|SURVEY|TITLE|LEASE|OTHER",
  "suggestedCategory": "DEAL|CONTACT|LP_RECORD|PROPERTY",
  "summary": "Brief summary of document contents",
  "dealReferences": ["array of property names or addresses mentioned"],
  "dateReferences": ["array of dates mentioned in YYYY-MM-DD format"],
  "monetaryReferences": ["array of dollar amounts mentioned"],
  "confidence": number 0.0-1.0
}`,

  AUTO_DETECT: `Analyze this document and extract all relevant CRE (Commercial Real Estate) data.
Detect the type of records present and extract them appropriately.

Return ONLY a JSON object:
{
  "detectedCategories": ["DEAL", "CONTACT", "LP_RECORD", "PROPERTY"],
  "deals": [/* array of deal records if found */],
  "contacts": [/* array of contact records if found */],
  "lpRecords": [/* array of LP records if found */],
  "properties": [/* array of property records if found */],
  "metadata": {
    "documentType": "string description",
    "confidence": number 0.0-1.0,
    "recordCounts": {
      "deals": number,
      "contacts": number,
      "lpRecords": number,
      "properties": number
    }
  }
}

Use the same record structure as the category-specific prompts above.`
};

// Field display formatters
const FIELD_FORMATTERS = {
  currency: (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v),
  percent: (v) => `${(v * 100).toFixed(2)}%`,
  number: (v) => new Intl.NumberFormat('en-US').format(v),
  date: (v) => v, // Already formatted as YYYY-MM-DD
  string: (v) => String(v)
};

const FIELD_TYPES = {
  // Currency fields
  askingPrice: 'currency',
  purchasePrice: 'currency',
  currentNOI: 'currency',
  committedCapital: 'currency',
  fundedCapital: 'currency',
  distributionsReceived: 'currency',
  averageRent: 'currency',
  marketValue: 'currency',
  loanBalance: 'currency',

  // Percentage fields
  capRate: 'percent',
  occupancy: 'percent',
  ownershipPercentage: 'percent',
  preferredReturn: 'percent',

  // Number fields
  unitCount: 'number',
  totalSF: 'number',
  buildingSF: 'number',
  landSF: 'number',
  yearBuilt: 'number',
  yearRenovated: 'number',
  stories: 'number',
  parkingSpaces: 'number'
};

class OnboardingExtractorService {
  constructor() {
    this.prisma = null;
    this.logger = null;
  }

  /**
   * Initialize with prisma and logger for a specific session
   */
  init(sessionId) {
    this.prisma = getPrisma();
    this.logger = createOnboardingLogger(this.prisma, sessionId);
    return this;
  }

  /**
   * Process a single intake source (file)
   */
  async processIntakeSource(sourceId, content, options = {}) {
    const prisma = this.prisma || getPrisma();

    // Get source details
    const source = await prisma.onboardingIntakeSource.findUnique({
      where: { id: sourceId },
      include: { session: true }
    });

    if (!source) {
      throw new Error(`Intake source not found: ${sourceId}`);
    }

    // Initialize logger if not already
    if (!this.logger) {
      this.logger = createOnboardingLogger(prisma, source.sessionId);
    }

    const timer = { start: Date.now() };

    try {
      // Update source status
      await prisma.onboardingIntakeSource.update({
        where: { id: sourceId },
        data: { status: 'PROCESSING' }
      });

      await this.logger.logExtractionStart(sourceId, source.fileName);

      // Determine extraction category
      const category = options.category || await this.detectCategory(content);

      // Extract records based on category
      const result = await this.extractRecords(content, category, source);

      // Create claims from extracted records
      const claims = await this.createClaimsFromRecords(
        source.sessionId,
        sourceId,
        source.fileName,
        result.records,
        category
      );

      // Update source status
      const duration = Date.now() - timer.start;
      await prisma.onboardingIntakeSource.update({
        where: { id: sourceId },
        data: {
          status: 'COMPLETED',
          recordsExtracted: claims.length,
          processedAt: new Date()
        }
      });

      await this.logger.logExtractionComplete(
        sourceId,
        source.fileName,
        claims.length,
        duration,
        result.tokensUsed
      );

      // Update session record counts
      await prisma.onboardingSession.update({
        where: { id: source.sessionId },
        data: {
          processedRecords: { increment: claims.length }
        }
      });

      return {
        sourceId,
        category,
        recordCount: result.records.length,
        claimCount: claims.length,
        duration
      };

    } catch (error) {
      await this.logger.logExtractionError(sourceId, source.fileName, error);

      await prisma.onboardingIntakeSource.update({
        where: { id: sourceId },
        data: {
          status: 'FAILED',
          errorMessage: error.message
        }
      });

      throw error;
    }
  }

  /**
   * Auto-detect the category of a document
   */
  async detectCategory(content) {
    const result = await this.callLLM(ONBOARDING_PROMPTS.DOCUMENT, content);

    if (result?.suggestedCategory) {
      return result.suggestedCategory;
    }

    // Default to DEAL if can't detect
    return 'DEAL';
  }

  /**
   * Extract records from content based on category
   */
  async extractRecords(content, category, source) {
    const prompt = ONBOARDING_PROMPTS[category] || ONBOARDING_PROMPTS.AUTO_DETECT;

    const result = await this.callLLM(prompt, content);

    if (!result) {
      return { records: [], tokensUsed: 0 };
    }

    // Handle different response formats
    let records = [];

    if (result.records) {
      records = result.records;
    } else if (category === 'DEAL' && result.deals) {
      records = result.deals;
    } else if (category === 'CONTACT' && result.contacts) {
      records = result.contacts;
    } else if (category === 'LP_RECORD' && result.lpRecords) {
      records = result.lpRecords;
    } else if (category === 'PROPERTY' && result.properties) {
      records = result.properties;
    }

    return {
      records,
      tokensUsed: result._tokensUsed || 0
    };
  }

  /**
   * Create OnboardingClaim records from extracted data
   */
  async createClaimsFromRecords(sessionId, sourceId, fileName, records, category) {
    const prisma = this.prisma || getPrisma();
    const claims = [];

    for (const record of records) {
      const recordKey = record.recordKey || uuidv4();
      const recordTitle = record.recordTitle || `${category} Record`;

      for (const [fieldPath, value] of Object.entries(record.fields || {})) {
        if (value === null || value === undefined) continue;

        const metadata = record.metadata?.[fieldPath] || {};
        const displayValue = this.formatDisplayValue(fieldPath, value);

        try {
          const claim = await prisma.onboardingClaim.create({
            data: {
              sessionId,
              sourceId,
              category,
              recordKey,
              recordTitle,
              fieldPath,
              fieldLabel: this.formatFieldLabel(fieldPath),
              value: JSON.stringify(value),
              displayValue,
              confidence: metadata.confidence || 0.7,
              extractionMethod: 'LLM',
              documentName: fileName,
              pageNumber: metadata.pageNumber,
              cellReference: metadata.location,
              textSnippet: metadata.textSnippet?.slice(0, 500),
              status: 'UNVERIFIED'
            }
          });

          claims.push(claim);
        } catch (error) {
          this.logger?.warn(COMPONENTS.EXTRACTOR, `Failed to create claim for ${fieldPath}`, {
            error: error.message,
            recordKey
          });
        }
      }
    }

    return claims;
  }

  /**
   * Format field value for display
   */
  formatDisplayValue(fieldPath, value) {
    if (value === null || value === undefined) return null;

    const fieldType = FIELD_TYPES[fieldPath];
    if (fieldType && FIELD_FORMATTERS[fieldType]) {
      try {
        return FIELD_FORMATTERS[fieldType](value);
      } catch {
        return String(value);
      }
    }

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  }

  /**
   * Convert camelCase field name to human-readable label
   */
  formatFieldLabel(fieldPath) {
    return fieldPath
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Call OpenAI API for extraction
   */
  async callLLM(systemPrompt, content) {
    if (!OPENAI_API_KEY) {
      this.logger?.warn(COMPONENTS.EXTRACTOR, 'OpenAI API key not configured');
      return null;
    }

    const timer = Date.now();

    try {
      const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.slice(0, 30000) } // Limit content
          ],
          temperature: 0,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger?.error(COMPONENTS.EXTRACTOR, 'OpenAI API error', { error });
        return null;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      const tokensUsed = data.usage?.total_tokens || 0;
      const duration = Date.now() - timer;

      await this.logger?.logAICall('extraction', systemPrompt.slice(0, 100), text?.slice(0, 100), tokensUsed, duration);

      if (!text) return null;

      const result = JSON.parse(text);
      result._tokensUsed = tokensUsed;
      return result;

    } catch (error) {
      this.logger?.error(COMPONENTS.EXTRACTOR, 'LLM call failed', { error: error.message });
      return null;
    }
  }

  /**
   * Discover data links between records in a session
   */
  async discoverDataLinks(sessionId) {
    const prisma = this.prisma || getPrisma();

    if (!this.logger) {
      this.logger = createOnboardingLogger(prisma, sessionId);
    }

    // Get all claims grouped by category and record
    const claims = await prisma.onboardingClaim.findMany({
      where: { sessionId },
      orderBy: [{ category: 'asc' }, { recordKey: 'asc' }]
    });

    // Group by record
    const records = new Map();
    for (const claim of claims) {
      const key = `${claim.category}:${claim.recordKey}`;
      if (!records.has(key)) {
        records.set(key, {
          category: claim.category,
          recordKey: claim.recordKey,
          recordTitle: claim.recordTitle,
          fields: {}
        });
      }
      records.get(key).fields[claim.fieldPath] = JSON.parse(claim.value);
    }

    const links = [];

    // Find Contact-Deal links (by email, name, or deal reference)
    const contacts = Array.from(records.values()).filter(r => r.category === 'CONTACT');
    const deals = Array.from(records.values()).filter(r => r.category === 'DEAL');

    for (const contact of contacts) {
      for (const deal of deals) {
        const matchResult = this.matchContactToDeal(contact, deal);
        if (matchResult.isMatch) {
          const link = await prisma.onboardingDataLink.create({
            data: {
              sessionId,
              linkType: 'CONTACT_DEAL',
              sourceRecordKey: contact.recordKey,
              sourceRecordTitle: contact.recordTitle,
              targetRecordKey: deal.recordKey,
              targetRecordTitle: deal.recordTitle,
              matchConfidence: matchResult.confidence,
              matchMethod: matchResult.method,
              matchDetails: JSON.stringify(matchResult.details),
              status: 'PENDING'
            }
          });

          links.push(link);

          await this.logger.logLinkDiscovered(
            'CONTACT_DEAL',
            contact.recordKey,
            deal.recordKey,
            matchResult.confidence,
            matchResult.method
          );
        }
      }
    }

    // Find LP-Deal links
    const lpRecords = Array.from(records.values()).filter(r => r.category === 'LP_RECORD');

    for (const lp of lpRecords) {
      for (const deal of deals) {
        const matchResult = this.matchLPToDeal(lp, deal);
        if (matchResult.isMatch) {
          const link = await prisma.onboardingDataLink.create({
            data: {
              sessionId,
              linkType: 'LP_DEAL',
              sourceRecordKey: lp.recordKey,
              sourceRecordTitle: lp.recordTitle,
              targetRecordKey: deal.recordKey,
              targetRecordTitle: deal.recordTitle,
              matchConfidence: matchResult.confidence,
              matchMethod: matchResult.method,
              matchDetails: JSON.stringify(matchResult.details),
              status: 'PENDING'
            }
          });

          links.push(link);

          await this.logger.logLinkDiscovered(
            'LP_DEAL',
            lp.recordKey,
            deal.recordKey,
            matchResult.confidence,
            matchResult.method
          );
        }
      }
    }

    return links;
  }

  /**
   * Match a contact to a deal based on various signals
   */
  matchContactToDeal(contact, deal) {
    const details = {};
    let confidence = 0;
    let method = 'NO_MATCH';

    // Check if contact's linkedDeals array contains this deal
    const linkedDeals = contact.fields.linkedDeals || [];
    const dealName = deal.fields.propertyName || deal.recordTitle || '';
    const dealAddress = deal.fields.propertyAddress || '';

    for (const linked of linkedDeals) {
      if (this.fuzzyMatch(linked, dealName) || this.fuzzyMatch(linked, dealAddress)) {
        details.linkedDealMatch = linked;
        confidence = 0.9;
        method = 'EXPLICIT_LINK';
        break;
      }
    }

    // Check if contact company matches broker info (only if no explicit link found)
    if (method === 'NO_MATCH' && contact.fields.company && deal.fields.brokerFirm) {
      if (this.fuzzyMatch(contact.fields.company, deal.fields.brokerFirm)) {
        details.companyMatch = { contact: contact.fields.company, deal: deal.fields.brokerFirm };
        confidence = Math.max(confidence, 0.7);
        method = 'COMPANY_MATCH';
      }
    }

    return {
      isMatch: confidence >= 0.6,
      confidence,
      method,
      details
    };
  }

  /**
   * Match an LP record to a deal
   */
  matchLPToDeal(lp, deal) {
    const details = {};
    let confidence = 0;
    let method = 'NO_MATCH';

    // Check if LP's dealName matches
    const lpDealName = lp.fields.dealName || '';
    const dealName = deal.fields.propertyName || deal.recordTitle || '';
    const dealAddress = deal.fields.propertyAddress || '';

    if (lpDealName && (this.fuzzyMatch(lpDealName, dealName) || this.fuzzyMatch(lpDealName, dealAddress))) {
      details.dealNameMatch = { lp: lpDealName, deal: dealName || dealAddress };
      confidence = 0.9;
      method = 'DEAL_NAME_MATCH';
    }

    return {
      isMatch: confidence >= 0.6,
      confidence,
      method,
      details
    };
  }

  /**
   * Simple fuzzy string matching
   */
  fuzzyMatch(str1, str2) {
    if (!str1 || !str2) return false;

    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(str1);
    const n2 = normalize(str2);

    // Exact match after normalization
    if (n1 === n2) return true;

    // Contains match
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Levenshtein distance for short strings
    if (n1.length < 50 && n2.length < 50) {
      const distance = this.levenshteinDistance(n1, n2);
      const maxLen = Math.max(n1.length, n2.length);
      return distance / maxLen < 0.3; // Allow 30% difference
    }

    return false;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(s1, s2) {
    const m = s1.length, n = s2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Detect conflicts between claims for the same field
   */
  async detectConflicts(sessionId) {
    const prisma = this.prisma || getPrisma();

    if (!this.logger) {
      this.logger = createOnboardingLogger(prisma, sessionId);
    }

    // Find claims with same recordKey and fieldPath but different values
    const claims = await prisma.onboardingClaim.findMany({
      where: { sessionId, status: 'UNVERIFIED' },
      orderBy: [{ recordKey: 'asc' }, { fieldPath: 'asc' }]
    });

    const conflicts = [];
    const grouped = new Map();

    // Group by recordKey + fieldPath
    for (const claim of claims) {
      const key = `${claim.recordKey}:${claim.fieldPath}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(claim);
    }

    // Find groups with multiple different values
    for (const [key, claimGroup] of grouped) {
      if (claimGroup.length < 2) continue;

      // Check if values differ
      const values = new Set(claimGroup.map(c => c.value));
      if (values.size < 2) continue;

      // Create conflict record
      const [claimA, claimB] = claimGroup;

      // Use AI to suggest resolution
      const suggestion = await this.suggestConflictResolution(claimA, claimB);

      const conflict = await prisma.onboardingConflict.create({
        data: {
          sessionId,
          claimAId: claimA.id,
          claimBId: claimB.id,
          fieldPath: claimA.fieldPath,
          status: 'UNRESOLVED',
          aiSuggestedValue: suggestion.value,
          aiRationale: suggestion.rationale,
          aiConfidence: suggestion.confidence
        }
      });

      conflicts.push(conflict);

      await this.logger.logConflictDetected(
        claimA.fieldPath,
        claimA.value,
        claimB.value,
        claimA.documentName,
        claimB.documentName
      );
    }

    return conflicts;
  }

  /**
   * Use AI to suggest conflict resolution
   */
  async suggestConflictResolution(claimA, claimB) {
    const prompt = `Two sources disagree on a value. Analyze and suggest which is correct.

Field: ${claimA.fieldPath}
Source A: "${claimA.documentName}" - Value: ${claimA.value} (confidence: ${claimA.confidence})
Source B: "${claimB.documentName}" - Value: ${claimB.value} (confidence: ${claimB.confidence})

Source A snippet: "${claimA.textSnippet || 'N/A'}"
Source B snippet: "${claimB.textSnippet || 'N/A'}"

Return JSON:
{
  "suggestedValue": "the value you recommend",
  "rationale": "brief explanation why",
  "confidence": number 0.0-1.0,
  "useSource": "A" or "B" or "MANUAL"
}`;

    const result = await this.callLLM(prompt, '');

    if (!result) {
      return {
        value: null,
        rationale: 'AI resolution unavailable',
        confidence: 0
      };
    }

    return {
      value: result.suggestedValue,
      rationale: result.rationale,
      confidence: result.confidence || 0.5
    };
  }
}

// Export singleton and class
const onboardingExtractorService = new OnboardingExtractorService();

export {
  onboardingExtractorService,
  OnboardingExtractorService,
  ONBOARDING_PROMPTS
};
