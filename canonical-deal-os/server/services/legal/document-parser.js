/**
 * Legal Document Parser Service
 *
 * Extracts text content from various document formats for legal analysis.
 *
 * Supported formats:
 * - PDF (via pdf-parse)
 * - DOCX (via mammoth)
 * - Plain text
 *
 * Features:
 * - Page-by-page extraction for PDFs
 * - Structure preservation for clause detection
 * - Text chunking for large documents
 */

import { promises as fs } from 'fs';
import path from 'path';

// Lazy load heavy dependencies
let pdfParse = null;
let mammoth = null;

async function loadPdfParse() {
  if (!pdfParse) {
    pdfParse = (await import('pdf-parse')).default;
  }
  return pdfParse;
}

async function loadMammoth() {
  if (!mammoth) {
    mammoth = await import('mammoth');
  }
  return mammoth;
}

// Configuration
const PARSER_CONFIG = {
  maxFileSizeMB: parseFloat(process.env.LEGAL_MAX_FILE_SIZE_MB) || 25,
  maxChunkTokens: parseInt(process.env.LEGAL_MAX_CHUNK_TOKENS) || 4000,
  chunkOverlapTokens: parseInt(process.env.LEGAL_CHUNK_OVERLAP_TOKENS) || 200,
  debug: process.env.DEBUG_LEGAL_PARSER === 'true',
};

// Supported MIME types
const SUPPORTED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

/**
 * Parse a document and extract its text content
 *
 * @param {string} storageKey - Path to the document file
 * @param {string} mimeType - MIME type of the document
 * @returns {Object} Parsed document with text, pages, and metadata
 */
export async function parseDocument(storageKey, mimeType) {
  const startTime = Date.now();
  const parseId = `parse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (PARSER_CONFIG.debug) {
    console.log(`[LEGAL-PARSER] [${parseId}] Starting parse: ${storageKey}, mimeType=${mimeType}`);
  }

  try {
    // Validate MIME type
    const docType = SUPPORTED_MIME_TYPES[mimeType];
    if (!docType) {
      throw new Error(`Unsupported document type: ${mimeType}`);
    }

    // Read file
    const fileBuffer = await fs.readFile(storageKey);
    const fileSizeMB = fileBuffer.length / (1024 * 1024);

    if (fileSizeMB > PARSER_CONFIG.maxFileSizeMB) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(2)}MB exceeds ${PARSER_CONFIG.maxFileSizeMB}MB limit`);
    }

    let result;
    switch (docType) {
      case 'pdf':
        result = await parsePDF(fileBuffer, parseId);
        break;
      case 'docx':
        result = await parseDOCX(fileBuffer, parseId);
        break;
      case 'doc':
        // For .doc files, try to parse as docx (some modern .doc are actually .docx)
        // If that fails, return error suggesting conversion
        try {
          result = await parseDOCX(fileBuffer, parseId);
        } catch {
          throw new Error('Legacy .doc format not supported. Please convert to .docx or PDF.');
        }
        break;
      case 'txt':
        result = await parsePlainText(fileBuffer, parseId);
        break;
      default:
        throw new Error(`Parser not implemented for type: ${docType}`);
    }

    const latencyMs = Date.now() - startTime;

    if (PARSER_CONFIG.debug) {
      console.log(`[LEGAL-PARSER] [${parseId}] Completed in ${latencyMs}ms, ${result.pageCount} pages, ${result.text.length} chars`);
    }

    return {
      success: true,
      parseId,
      ...result,
      latencyMs,
    };
  } catch (error) {
    console.error(`[LEGAL-PARSER] [${parseId}] Error:`, error.message);
    return {
      success: false,
      parseId,
      error: error.message,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Parse PDF document
 */
async function parsePDF(buffer, parseId) {
  const pdf = await loadPdfParse();

  if (PARSER_CONFIG.debug) {
    console.log(`[LEGAL-PARSER] [${parseId}] Parsing PDF, ${buffer.length} bytes`);
  }

  const data = await pdf(buffer, {
    // Custom page renderer to track page numbers
    pagerender: async function(pageData) {
      const textContent = await pageData.getTextContent();
      const strings = textContent.items.map(item => item.str);
      return strings.join(' ');
    }
  });

  // Extract pages separately for page-level operations
  const pages = [];
  if (data.text) {
    // Split by common page break patterns
    const pageTexts = data.text.split(/\f|\n{4,}/);
    for (let i = 0; i < pageTexts.length; i++) {
      const text = pageTexts[i].trim();
      if (text) {
        pages.push({
          pageNumber: i + 1,
          text,
          charCount: text.length,
        });
      }
    }
  }

  return {
    text: data.text || '',
    pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: data.text || '', charCount: (data.text || '').length }],
    pageCount: data.numpages || pages.length || 1,
    metadata: {
      author: data.info?.Author,
      title: data.info?.Title,
      creationDate: data.info?.CreationDate,
      modDate: data.info?.ModDate,
    },
  };
}

/**
 * Parse DOCX document
 */
async function parseDOCX(buffer, parseId) {
  const mammothLib = await loadMammoth();

  if (PARSER_CONFIG.debug) {
    console.log(`[LEGAL-PARSER] [${parseId}] Parsing DOCX, ${buffer.length} bytes`);
  }

  // Extract as plain text
  const textResult = await mammothLib.extractRawText({ buffer });

  // Also extract with structure for better clause detection
  const htmlResult = await mammothLib.convertToHtml({ buffer });

  // Split into pages (DOCX doesn't have native pages, use section breaks or estimate)
  const text = textResult.value || '';
  const estimatedPagesPerSection = 3000; // ~3000 chars per page estimate
  const pages = [];

  for (let i = 0; i < text.length; i += estimatedPagesPerSection) {
    const pageText = text.substring(i, i + estimatedPagesPerSection);
    pages.push({
      pageNumber: pages.length + 1,
      text: pageText,
      charCount: pageText.length,
    });
  }

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, text: '', charCount: 0 });
  }

  return {
    text,
    pages,
    pageCount: pages.length,
    html: htmlResult.value,
    metadata: {
      warnings: [...(textResult.messages || []), ...(htmlResult.messages || [])],
    },
  };
}

/**
 * Parse plain text document
 */
async function parsePlainText(buffer, parseId) {
  const text = buffer.toString('utf-8');

  if (PARSER_CONFIG.debug) {
    console.log(`[LEGAL-PARSER] [${parseId}] Parsing TXT, ${buffer.length} bytes`);
  }

  // Split into pages by double newlines or every ~3000 chars
  const pages = [];
  const sections = text.split(/\n{3,}/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed) {
      pages.push({
        pageNumber: pages.length + 1,
        text: trimmed,
        charCount: trimmed.length,
      });
    }
  }

  if (pages.length === 0) {
    pages.push({ pageNumber: 1, text, charCount: text.length });
  }

  return {
    text,
    pages,
    pageCount: pages.length,
    metadata: {},
  };
}

/**
 * Get just the text content of a document
 */
export async function getDocumentText(storageKey, mimeType) {
  const result = await parseDocument(storageKey, mimeType);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.text;
}

/**
 * Extract pages from a document
 */
export async function extractPages(storageKey, mimeType) {
  const result = await parseDocument(storageKey, mimeType);
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.pages;
}

/**
 * Chunk document text for processing with LLMs
 *
 * @param {string} text - Full document text
 * @param {Object} options - Chunking options
 * @returns {Array} Array of text chunks with metadata
 */
export function chunkDocument(text, options = {}) {
  const maxTokens = options.maxTokens || PARSER_CONFIG.maxChunkTokens;
  const overlapTokens = options.overlapTokens || PARSER_CONFIG.chunkOverlapTokens;

  // Rough estimate: 1 token ≈ 4 chars for English text
  const charsPerToken = 4;
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChars;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      // Look for paragraph break
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + maxChars / 2) {
        end = paragraphBreak;
      } else {
        // Look for sentence break
        const sentenceBreak = text.lastIndexOf('. ', end);
        if (sentenceBreak > start + maxChars / 2) {
          end = sentenceBreak + 1;
        }
      }
    }

    const chunkText = text.substring(start, end).trim();
    if (chunkText) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunkText,
        charCount: chunkText.length,
        estimatedTokens: Math.ceil(chunkText.length / charsPerToken),
        startChar: start,
        endChar: end,
      });
    }

    // Move start with overlap
    start = end - overlapChars;
    if (start <= chunks[chunks.length - 1]?.startChar) {
      start = end; // Prevent infinite loop
    }
  }

  return chunks;
}

/**
 * Find page number for a given text excerpt
 *
 * @param {Array} pages - Array of page objects
 * @param {string} excerpt - Text to find
 * @returns {number|null} Page number or null if not found
 */
export function findPageForExcerpt(pages, excerpt) {
  if (!excerpt || excerpt.length < 10) return null;

  // Normalize for comparison
  const normalizedExcerpt = excerpt.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const page of pages) {
    const normalizedPage = page.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalizedPage.includes(normalizedExcerpt)) {
      return page.pageNumber;
    }
  }

  // Try fuzzy match with first 50 chars
  const shortExcerpt = normalizedExcerpt.substring(0, 50);
  for (const page of pages) {
    const normalizedPage = page.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalizedPage.includes(shortExcerpt)) {
      return page.pageNumber;
    }
  }

  return null;
}

export default {
  parseDocument,
  getDocumentText,
  extractPages,
  chunkDocument,
  findPageForExcerpt,
  SUPPORTED_MIME_TYPES,
};
