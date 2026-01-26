import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Building2, ChevronRight, Clock } from "lucide-react";

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * InvitationAlertCard
 *
 * Displays an alert on the broker's home page when they have pending invitations.
 * Shows a summary and links to view/respond to invitations.
 */
export default function InvitationAlertCard({ invitations = [], onViewAll }) {
  const pendingInvitations = invitations.filter(inv => inv.status === 'PENDING');

  if (pendingInvitations.length === 0) return null;

  const count = pendingInvitations.length;
  const latestInvitation = pendingInvitations[0];

  return (
    <Card className="border-l-4 border-l-amber-500 bg-amber-50">
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-full flex-shrink-0">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">
                {count === 1 ? 'New Listing Invitation' : `${count} New Listing Invitations`}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {count === 1 ? (
                  <>
                    <span className="font-medium">{latestInvitation.invitedByName || 'A seller'}</span> invited you to represent{' '}
                    <span className="font-medium">{latestInvitation.dealDraft?.propertyName || 'a property'}</span>
                  </>
                ) : (
                  `You have ${count} pending listing invitations to review`
                )}
              </p>
              {count === 1 && latestInvitation.sentAt && (
                <p className="text-xs text-slate-500 mt-1">
                  Received {formatDate(latestInvitation.sentAt)}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {count === 1 ? (
              <Link to={createPageUrl(`DealWorkspace?dealDraftId=${latestInvitation.dealDraftId}`)}>
                <Button className="gap-2">
                  View Invitation
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link to={createPageUrl('DealDrafts')}>
                <Button className="gap-2">
                  View All Invitations
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Preview of multiple invitations */}
        {count > 1 && count <= 3 && (
          <div className="mt-4 pt-4 border-t border-amber-200 space-y-2">
            {pendingInvitations.slice(0, 3).map((inv) => (
              <Link
                key={inv.id}
                to={createPageUrl(`DealWorkspace?dealDraftId=${inv.dealDraftId}`)}
                className="flex items-center justify-between p-2 rounded hover:bg-amber-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {inv.dealDraft?.propertyName || 'Property'}
                    </p>
                    <p className="text-xs text-slate-500">
                      From {inv.invitedByName || inv.invitedByEmail}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-500 text-amber-700 text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
