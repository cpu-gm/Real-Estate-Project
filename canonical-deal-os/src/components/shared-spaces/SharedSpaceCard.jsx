/**
 * Shared Space Card - Display space summary in list view
 */

import React from 'react';
import {
  Users2,
  FileText,
  MessageSquare,
  Clock,
  Building2,
  Briefcase,
  Lock,
  Calendar
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/card';
import { Badge } from '../ui/badge';

export default function SharedSpaceCard({ space, onClick }) {
  const memberCount = space.members?.length || 0;
  const documentCount = space.documents?.length || 0;
  const messageCount = space.messages?.length || 0;

  // Count external members
  const externalCount = space.members?.filter(m => m.externalEmail).length || 0;
  const internalCount = memberCount - externalCount;

  // Check if space is expiring soon (within 7 days)
  const isExpiringSoon = space.expiresAt &&
    new Date(space.expiresAt) - new Date() < 7 * 24 * 60 * 60 * 1000 &&
    new Date(space.expiresAt) > new Date();

  const isExpired = space.expiresAt && new Date(space.expiresAt) < new Date();

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users2 className="w-5 h-5" />
              {space.name}
            </CardTitle>
            {space.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {space.description}
              </CardDescription>
            )}
          </div>
          <div className="flex gap-1">
            {!space.isActive && (
              <Badge variant="secondary">
                Archived
              </Badge>
            )}
            {isExpired && (
              <Badge variant="destructive">
                Expired
              </Badge>
            )}
            {isExpiringSoon && !isExpired && (
              <Badge variant="warning" className="bg-yellow-100 text-yellow-800">
                Expiring Soon
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Linked Context */}
        {(space.dealId || space.matterId) && (
          <div className="flex gap-2 text-sm">
            {space.dealId && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Deal
              </Badge>
            )}
            {space.matterId && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                Matter
              </Badge>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-700">
              <Users2 className="w-4 h-4" />
              {memberCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {externalCount > 0 ? (
                <span>{internalCount} internal, {externalCount} external</span>
              ) : (
                <span>Members</span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-700">
              <FileText className="w-4 h-4" />
              {documentCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">Documents</div>
          </div>

          <div>
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-700">
              <MessageSquare className="w-4 h-4" />
              {messageCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">Messages</div>
          </div>
        </div>

        {/* Expiration */}
        {space.expiresAt && !isExpired && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t">
            <Calendar className="w-3 h-3" />
            <span>
              Expires {new Date(space.expiresAt).toLocaleDateString()}
            </span>
          </div>
        )}

        {/* Created info */}
        <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t">
          <Clock className="w-3 h-3" />
          <span>
            Created {new Date(space.createdAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
