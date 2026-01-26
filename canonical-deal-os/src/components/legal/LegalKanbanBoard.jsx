/**
 * Legal Kanban Board Component
 *
 * Displays matters in a Kanban-style board with three columns:
 * - NEW: Newly created matters
 * - IN_PROGRESS: Matters being worked on
 * - COMPLETE: Finished matters
 *
 * Features:
 * - Drag and drop between columns
 * - Auto-aging color indicators
 * - Click to view matter details
 */

import React, { useState } from 'react';
import { Inbox, Clock, CheckCircle } from 'lucide-react';
import LegalMatterCard from './LegalMatterCard';

const COLUMNS = [
  {
    id: 'NEW',
    label: 'New',
    icon: Inbox,
    color: 'blue',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    headerColor: 'bg-blue-100 text-blue-800'
  },
  {
    id: 'IN_PROGRESS',
    label: 'In Progress',
    icon: Clock,
    color: 'yellow',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    headerColor: 'bg-yellow-100 text-yellow-800'
  },
  {
    id: 'COMPLETE',
    label: 'Complete',
    icon: CheckCircle,
    color: 'green',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    headerColor: 'bg-green-100 text-green-800'
  }
];

export default function LegalKanbanBoard({ columns, onMatterClick, onStageChange }) {
  const [draggedMatter, setDraggedMatter] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const handleDragStart = (e, matter) => {
    setDraggedMatter(matter);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', matter.id);
    // Add dragging class for visual feedback
    e.target.classList.add('opacity-50');
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('opacity-50');
    setDraggedMatter(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e, targetStage) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedMatter && draggedMatter.stage !== targetStage) {
      onStageChange?.(draggedMatter.id, targetStage);
    }
    setDraggedMatter(null);
  };

  return (
    <div
      className="grid grid-cols-3 gap-4"
      data-testid="kanban-board"
    >
      {COLUMNS.map(column => {
        const matters = columns?.[column.id] || [];
        const isDropTarget = dragOverColumn === column.id && draggedMatter?.stage !== column.id;
        const Icon = column.icon;

        return (
          <div
            key={column.id}
            data-stage={column.id}
            className={`rounded-lg border-2 transition-all ${column.borderColor} ${
              isDropTarget ? 'ring-2 ring-blue-400 ring-offset-2' : ''
            }`}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`p-3 rounded-t-lg ${column.headerColor} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                <span className="font-semibold">{column.label}</span>
              </div>
              <span className="count-badge px-2 py-0.5 rounded-full bg-white/50 text-sm font-medium">
                {matters.length}
              </span>
            </div>

            {/* Column Content */}
            <div className={`p-3 min-h-[300px] ${column.bgColor} space-y-3`}>
              {matters.length > 0 ? (
                matters.map(matter => (
                  <LegalMatterCard
                    key={matter.id}
                    matter={matter}
                    onClick={() => onMatterClick?.(matter.id)}
                    draggable={column.id !== 'COMPLETE'} // Don't allow dragging completed
                    onDragStart={(e) => handleDragStart(e, matter)}
                    onDragEnd={handleDragEnd}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No matters</p>
                </div>
              )}

              {/* Drop indicator */}
              {isDropTarget && (
                <div className="border-2 border-dashed border-blue-400 rounded-lg p-4 text-center text-blue-500 text-sm">
                  Drop here to move to {column.label}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
