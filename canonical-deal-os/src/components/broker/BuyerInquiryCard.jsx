import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { bff } from "@/api/bffClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  User,
  Building2,
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle,
  FileCheck,
  Send,
  Clock,
  DollarSign,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from "lucide-react";

/**
 * Format currency
 */
function formatCurrency(value) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Format relative time
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Response type badge
 */
function ResponseBadge({ type }) {
  const config = {
    INTERESTED: {
      label: "Interested",
      className: "bg-green-100 text-green-800 border-green-200"
    },
    INTERESTED_WITH_CONDITIONS: {
      label: "Interested w/ Conditions",
      className: "bg-amber-100 text-amber-800 border-amber-200"
    },
    PASS: {
      label: "Passed",
      className: "bg-slate-100 text-slate-600 border-slate-200"
    }
  };

  const { label, className } = config[type] || config.INTERESTED;

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

/**
 * Authorization status badge
 */
function AuthStatusBadge({ authorization }) {
  if (!authorization) {
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-600">
        <Clock className="h-3 w-3 mr-1" />
        Pending Review
      </Badge>
    );
  }

  const statusConfig = {
    PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600", icon: Clock },
    AUTHORIZED: { label: "Authorized", className: "bg-green-100 text-green-800", icon: CheckCircle },
    DECLINED: { label: "Declined", className: "bg-red-100 text-red-800", icon: XCircle },
    REVOKED: { label: "Revoked", className: "bg-red-100 text-red-800", icon: XCircle }
  };

  const ndaConfig = {
    NOT_SENT: null,
    SENT: { label: "NDA Sent", className: "bg-blue-100 text-blue-800", icon: Send },
    SIGNED: { label: "NDA Signed", className: "bg-green-100 text-green-800", icon: FileCheck },
    EXPIRED: { label: "NDA Expired", className: "bg-amber-100 text-amber-800", icon: AlertCircle }
  };

  const status = statusConfig[authorization.status] || statusConfig.PENDING;
  const nda = ndaConfig[authorization.ndaStatus];
  const StatusIcon = status.icon;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={status.className}>
        <StatusIcon className="h-3 w-3 mr-1" />
        {status.label}
      </Badge>
      {nda && (
        <Badge variant="outline" className={nda.className}>
          <nda.icon className="h-3 w-3 mr-1" />
          {nda.label}
        </Badge>
      )}
    </div>
  );
}

/**
 * BuyerInquiryCard Component
 * Displays buyer inquiry with actions for broker
 */
export default function BuyerInquiryCard({
  inquiry,
  dealDraftId,
  onReply,
  onAuthorize,
  onSendNDA,
  onDecline
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  console.log("[BuyerInquiryCard] Rendering", {
    buyerUserId: inquiry.buyerUserId,
    responseType: inquiry.responseType
  });

  // Authorize mutation
  const authorizeMutation = useMutation({
    mutationFn: () => bff.gate.authorize(dealDraftId, inquiry.buyerUserId, {
      accessLevel: "STANDARD"
    }),
    onSuccess: () => {
      console.log("[BuyerInquiryCard] Authorized buyer", { buyerUserId: inquiry.buyerUserId });
      toast({
        title: "Buyer authorized",
        description: `${inquiry.buyerName} has been authorized for standard access.`
      });
      queryClient.invalidateQueries(["broker-listing-inquiries", dealDraftId]);
      queryClient.invalidateQueries(["broker-dashboard"]);
    },
    onError: (error) => {
      console.error("[BuyerInquiryCard] Authorize failed", error);
      toast({
        title: "Authorization failed",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    }
  });

  // Send NDA mutation
  const sendNDAMutation = useMutation({
    mutationFn: () => bff.gate.sendNDA(dealDraftId, inquiry.buyerUserId),
    onSuccess: () => {
      console.log("[BuyerInquiryCard] NDA sent", { buyerUserId: inquiry.buyerUserId });
      toast({
        title: "NDA sent",
        description: `NDA has been sent to ${inquiry.buyerName}.`
      });
      queryClient.invalidateQueries(["broker-listing-inquiries", dealDraftId]);
    },
    onError: (error) => {
      console.error("[BuyerInquiryCard] Send NDA failed", error);
      toast({
        title: "Failed to send NDA",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    }
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: () => bff.gate.decline(dealDraftId, inquiry.buyerUserId, {
      reason: "Not qualified"
    }),
    onSuccess: () => {
      console.log("[BuyerInquiryCard] Declined buyer", { buyerUserId: inquiry.buyerUserId });
      toast({
        title: "Buyer declined",
        description: `${inquiry.buyerName} has been declined.`
      });
      queryClient.invalidateQueries(["broker-listing-inquiries", dealDraftId]);
      queryClient.invalidateQueries(["broker-dashboard"]);
    },
    onError: (error) => {
      console.error("[BuyerInquiryCard] Decline failed", error);
      toast({
        title: "Decline failed",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleAuthorize = () => {
    if (onAuthorize) {
      onAuthorize(inquiry);
    } else {
      authorizeMutation.mutate();
    }
  };

  const handleSendNDA = () => {
    if (onSendNDA) {
      onSendNDA(inquiry);
    } else {
      sendNDAMutation.mutate();
    }
  };

  const handleDecline = () => {
    if (onDecline) {
      onDecline(inquiry);
    } else {
      declineMutation.mutate();
    }
  };

  const handleReply = () => {
    console.log("[BuyerInquiryCard] Reply clicked", { buyerUserId: inquiry.buyerUserId });
    if (onReply) {
      onReply(inquiry);
    }
  };

  const hasQuestions = inquiry.questionsForBroker?.length > 0;
  const hasConditions = inquiry.conditions?.length > 0;
  const hasPriceRange = inquiry.indicativePriceMin || inquiry.indicativePriceMax;
  const isLoading = authorizeMutation.isPending || sendNDAMutation.isPending || declineMutation.isPending;

  // Determine available actions based on authorization state
  const canAuthorize = !inquiry.authorization || inquiry.authorization.status === "PENDING";
  const canSendNDA = inquiry.authorization?.status === "AUTHORIZED" &&
    (!inquiry.authorization.ndaStatus || inquiry.authorization.ndaStatus === "NOT_SENT");
  const canDecline = !inquiry.authorization || inquiry.authorization.status === "PENDING";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        {/* Header: Buyer info + response badge */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 bg-slate-100 rounded-full flex-shrink-0">
              <User className="h-5 w-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">
                {inquiry.buyerName || "Unknown Buyer"}
              </h3>
              {inquiry.buyerFirm && (
                <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{inquiry.buyerFirm}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-sm text-slate-500 mt-0.5">
                <Mail className="h-3 w-3" />
                <span className="truncate">{inquiry.buyerEmail}</span>
              </div>
            </div>
          </div>
          <ResponseBadge type={inquiry.responseType} />
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <AuthStatusBadge authorization={inquiry.authorization} />
          <span className="text-xs text-slate-500">
            {formatRelativeTime(inquiry.respondedAt)}
          </span>
        </div>

        {/* Quick stats */}
        {(inquiry.viewedAt || hasPriceRange) && (
          <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
            {inquiry.viewedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Viewed {formatRelativeTime(inquiry.viewedAt)}
              </span>
            )}
            {hasPriceRange && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {formatCurrency(inquiry.indicativePriceMin)} - {formatCurrency(inquiry.indicativePriceMax)}
              </span>
            )}
          </div>
        )}

        {/* Questions/Conditions summary */}
        {(hasQuestions || hasConditions) && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {hasQuestions && `${inquiry.questionsForBroker.length} question(s)`}
              {hasQuestions && hasConditions && " + "}
              {hasConditions && `${inquiry.conditions.length} condition(s)`}
            </button>

            {expanded && (
              <div className="mt-3 space-y-3">
                {hasQuestions && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Questions for Broker</h4>
                    <ul className="space-y-1">
                      {inquiry.questionsForBroker.map((q, idx) => (
                        <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                          <MessageSquare className="h-3 w-3 mt-1 flex-shrink-0" />
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasConditions && (
                  <div className="bg-amber-50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-amber-800 mb-2">Conditions</h4>
                    <ul className="space-y-1">
                      {inquiry.conditions.map((c, idx) => (
                        <li key={idx} className="text-sm text-amber-700 flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 mt-1 flex-shrink-0" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          {hasQuestions && (
            <Button
              variant="default"
              size="sm"
              onClick={handleReply}
              className="gap-1"
            >
              <MessageSquare className="h-4 w-4" />
              Reply
            </Button>
          )}

          {canAuthorize && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAuthorize}
              disabled={isLoading}
              className="gap-1"
            >
              {authorizeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Authorize
            </Button>
          )}

          {canSendNDA && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendNDA}
              disabled={isLoading}
              className="gap-1"
            >
              {sendNDAMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send NDA
            </Button>
          )}

          {canDecline && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDecline}
              disabled={isLoading}
              className="gap-1 text-slate-500 hover:text-red-600"
            >
              {declineMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Decline
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
