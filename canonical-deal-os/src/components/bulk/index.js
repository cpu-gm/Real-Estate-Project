/**
 * Bulk Operations Components
 *
 * Components for bulk selection and operations:
 * - BulkActionBar: Fixed bottom action bar with selection count
 * - BulkProgressModal: Progress tracking modal
 * - SelectableCard: Card wrapper with checkbox overlay
 */

export { BulkActionBar } from './BulkActionBar';
export { BulkProgressModal } from './BulkProgressModal';
export { SelectableCard } from './SelectableCard';

// Re-export hook for convenience
export { useBulkSelection } from '@/lib/hooks/useBulkSelection';
