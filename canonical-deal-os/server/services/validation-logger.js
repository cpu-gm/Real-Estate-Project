/**
 * Validation Logger
 *
 * Provides debug logging for validation changes to track input/output
 * and identify issues during the validation sprint.
 */

/**
 * Create a validation logger for a specific route
 * @param {string} routeName - Name of the route being validated
 * @returns {Object} Logger object with before/after/failed methods
 */
export function createValidationLogger(routeName) {
  const enabled = process.env.NODE_ENV !== 'production' || process.env.DEBUG_VALIDATION === 'true';

  return {
    /**
     * Log input before validation
     * @param {*} body - Raw request body
     */
    beforeValidation: (body) => {
      if (enabled) {
        console.log(`[VALIDATION:${routeName}] Input:`, JSON.stringify(body, null, 2));
      }
    },

    /**
     * Log parsed output after validation
     * @param {*} parsed - Validated and parsed data
     */
    afterValidation: (parsed) => {
      if (enabled) {
        console.log(`[VALIDATION:${routeName}] Parsed:`, JSON.stringify(parsed, null, 2));
      }
    },

    /**
     * Log validation failure with error details
     * @param {*} errors - Zod validation errors
     */
    validationFailed: (errors) => {
      // Always log validation failures for debugging
      console.warn(`[VALIDATION:${routeName}] FAILED:`, JSON.stringify(errors, null, 2));
    }
  };
}
