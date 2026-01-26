import React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StarRating - Displays a star rating (read-only or interactive)
 *
 * @param {number} value - The rating value (0-5)
 * @param {function} onChange - Callback when rating changes (makes it interactive)
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} showValue - Show numeric value next to stars
 * @param {number} count - Number of ratings (for display)
 * @param {string} className - Additional CSS classes
 */
export function StarRating({
  value = 0,
  onChange,
  size = 'md',
  showValue = false,
  count,
  className
}) {
  const isInteractive = !!onChange;
  const [hoverValue, setHoverValue] = React.useState(0);

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const starSize = sizeClasses[size] || sizeClasses.md;
  const textSize = textSizeClasses[size] || textSizeClasses.md;

  const displayValue = hoverValue || value || 0;

  const handleClick = (rating) => {
    if (isInteractive && onChange) {
      onChange(rating);
    }
  };

  const handleMouseEnter = (rating) => {
    if (isInteractive) {
      setHoverValue(rating);
    }
  };

  const handleMouseLeave = () => {
    if (isInteractive) {
      setHoverValue(0);
    }
  };

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayValue;
        const isPartiallyFilled = star > displayValue && star - 1 < displayValue;
        const fillPercent = isPartiallyFilled ? ((displayValue % 1) * 100) : 0;

        return (
          <button
            key={star}
            type="button"
            className={cn(
              'relative focus:outline-none',
              isInteractive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'
            )}
            onClick={() => handleClick(star)}
            onMouseEnter={() => handleMouseEnter(star)}
            onMouseLeave={handleMouseLeave}
            disabled={!isInteractive}
          >
            {/* Background (empty) star */}
            <Star
              className={cn(
                starSize,
                'text-gray-300'
              )}
            />
            {/* Filled star overlay */}
            {(isFilled || isPartiallyFilled) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: isFilled ? '100%' : `${fillPercent}%` }}
              >
                <Star
                  className={cn(
                    starSize,
                    'text-yellow-400 fill-yellow-400'
                  )}
                />
              </div>
            )}
          </button>
        );
      })}

      {showValue && value !== null && value !== undefined && (
        <span className={cn('text-gray-600 ml-1', textSize)}>
          {value.toFixed(1)}
        </span>
      )}

      {count !== undefined && (
        <span className={cn('text-gray-400 ml-1', textSize)}>
          ({count})
        </span>
      )}
    </div>
  );
}

/**
 * RatingBreakdown - Shows distribution of ratings
 */
export function RatingBreakdown({ ratings = [], className }) {
  const totalRatings = ratings.length;

  if (totalRatings === 0) {
    return (
      <div className={cn('text-sm text-gray-500', className)}>
        No ratings yet
      </div>
    );
  }

  // Calculate distribution
  const distribution = [5, 4, 3, 2, 1].map(star => {
    const count = ratings.filter(r => Math.round(r.overallRating) === star).length;
    const percent = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
    return { star, count, percent };
  });

  // Calculate average
  const avgRating = ratings.reduce((sum, r) => sum + r.overallRating, 0) / totalRatings;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-semibold">{avgRating.toFixed(1)}</span>
        <div>
          <StarRating value={avgRating} size="md" />
          <p className="text-sm text-gray-500">{totalRatings} rating{totalRatings !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-1">
        {distribution.map(({ star, count, percent }) => (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-3 text-gray-600">{star}</span>
            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-8 text-right text-gray-500">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default StarRating;
