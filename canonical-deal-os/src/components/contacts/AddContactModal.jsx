import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  AlertTriangle,
  User,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { bff } from '@/api/bffClient';
import { toast } from 'sonner';

// Contact types
const CONTACT_TYPES = [
  { value: 'BROKER', label: 'Broker' },
  { value: 'LENDER', label: 'Lender' },
  { value: 'ATTORNEY', label: 'Attorney' },
  { value: 'TITLE_COMPANY', label: 'Title Company' },
  { value: 'APPRAISER', label: 'Appraiser' },
  { value: 'INSPECTOR', label: 'Inspector' },
  { value: 'ENVIRONMENTAL', label: 'Environmental Consultant' },
  { value: 'PROPERTY_MANAGER', label: 'Property Manager' },
  { value: 'ESCROW_AGENT', label: 'Escrow Agent' },
  { value: 'INSURANCE_AGENT', label: 'Insurance Agent' },
  { value: 'TAX_ADVISOR', label: 'Tax Advisor' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'INVESTOR', label: 'Investor' },
  { value: 'OTHER', label: 'Other' }
];

// Type-specific field configurations
const TYPE_SPECIFIC_FIELDS = {
  BROKER: [
    { key: 'licenseNo', label: 'License Number', type: 'text' },
    { key: 'licenseState', label: 'License State', type: 'text' },
    { key: 'licenseExpiry', label: 'License Expiry', type: 'date' },
    { key: 'mlsId', label: 'MLS ID', type: 'text' },
    { key: 'brokerageAffiliation', label: 'Brokerage', type: 'text' }
  ],
  LENDER: [
    { key: 'nmlsId', label: 'NMLS ID', type: 'text' },
    { key: 'loanTypes', label: 'Loan Types', type: 'text', placeholder: 'e.g., Bridge, Perm, Construction' },
    { key: 'typicalTerms', label: 'Typical Terms', type: 'text' },
    { key: 'minLoanSize', label: 'Min Loan Size ($)', type: 'number' },
    { key: 'maxLoanSize', label: 'Max Loan Size ($)', type: 'number' }
  ],
  ATTORNEY: [
    { key: 'barNumber', label: 'Bar Number', type: 'text' },
    { key: 'barStates', label: 'Bar States', type: 'text', placeholder: 'e.g., NY, CA, TX' },
    { key: 'specialties', label: 'Specialties', type: 'text', placeholder: 'e.g., Real Estate, Corporate' }
  ],
  APPRAISER: [
    { key: 'licenseNo', label: 'License Number', type: 'text' },
    { key: 'licenseState', label: 'License State', type: 'text' },
    { key: 'certifications', label: 'Certifications', type: 'text', placeholder: 'e.g., MAI, SRA' }
  ]
};

/**
 * AddContactModal - Modal for creating/editing contacts
 *
 * @param {boolean} open - Whether the modal is open
 * @param {function} onOpenChange - Callback to toggle modal
 * @param {string} defaultType - Pre-select a contact type
 * @param {object} editContact - Contact to edit (null for create)
 * @param {function} onSuccess - Callback after successful save
 */
export function AddContactModal({
  open,
  onOpenChange,
  defaultType = null,
  editContact = null,
  onSuccess
}) {
  const queryClient = useQueryClient();
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [selectedType, setSelectedType] = useState(defaultType || 'BROKER');

  const isEditing = !!editContact;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty }
  } = useForm({
    defaultValues: {
      contactType: defaultType || 'BROKER',
      isPerson: true,
      name: '',
      companyName: '',
      title: '',
      email: '',
      phone: '',
      phoneAlt: '',
      website: '',
      notes: '',
      isOrgPreferred: false,
      typeFields: {}
    }
  });

  const watchEmail = watch('email');
  const watchContactType = watch('contactType');

  // Update selected type when form value changes
  useEffect(() => {
    setSelectedType(watchContactType);
  }, [watchContactType]);

  // Load edit contact data
  useEffect(() => {
    if (editContact) {
      let typeFields = {};
      try {
        if (editContact.typeFields) {
          typeFields = typeof editContact.typeFields === 'string'
            ? JSON.parse(editContact.typeFields)
            : editContact.typeFields;
        }
      } catch (e) {
        console.warn('Failed to parse typeFields:', e);
      }

      reset({
        contactType: editContact.contactType || 'BROKER',
        isPerson: editContact.isPerson ?? true,
        name: editContact.name || '',
        companyName: editContact.companyName || '',
        title: editContact.title || '',
        email: editContact.email || '',
        phone: editContact.phone || '',
        phoneAlt: editContact.phoneAlt || '',
        website: editContact.website || '',
        notes: editContact.notes || '',
        isOrgPreferred: editContact.isOrgPreferred || false,
        typeFields
      });
      setSelectedType(editContact.contactType || 'BROKER');
    }
  }, [editContact, reset]);

  // Check for duplicates when email changes
  useEffect(() => {
    if (!watchEmail || watchEmail.length < 5 || isEditing) {
      setDuplicateWarning(null);
      return;
    }

    const checkDuplicate = async () => {
      try {
        const result = await bff.contacts.checkDuplicate(watchEmail);
        if (result?.exists) {
          setDuplicateWarning(result.contact);
        } else {
          setDuplicateWarning(null);
        }
      } catch (e) {
        // Ignore errors
      }
    };

    const timeoutId = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timeoutId);
  }, [watchEmail, isEditing]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data) => bff.contacts.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Contact created successfully');
      onOpenChange(false);
      reset();
      onSuccess?.(result);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create contact');
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data) => bff.contacts.update(editContact.id, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts', editContact.id] });
      toast.success('Contact updated successfully');
      onOpenChange(false);
      onSuccess?.(result);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update contact');
    }
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data) => {
    // Process type-specific fields
    const typeFields = data.typeFields || {};

    const payload = {
      contactType: data.contactType,
      isPerson: data.isPerson,
      name: data.name,
      companyName: data.companyName || null,
      title: data.title || null,
      email: data.email || null,
      phone: data.phone || null,
      phoneAlt: data.phoneAlt || null,
      website: data.website || null,
      notes: data.notes || null,
      isOrgPreferred: data.isOrgPreferred,
      typeFields: Object.keys(typeFields).length > 0 ? typeFields : null
    };

    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      if (!isEditing) {
        reset();
      }
    }
  };

  // Get type-specific fields for current type
  const typeSpecificFields = TYPE_SPECIFIC_FIELDS[selectedType] || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Contact' : 'Add New Contact'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update contact information'
              : 'Add a new vendor or contact to your organization'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Duplicate warning */}
          {duplicateWarning && (
            <Alert variant="warning" className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                A contact with this email already exists: <strong>{duplicateWarning.name}</strong>
                {duplicateWarning.companyName && ` (${duplicateWarning.companyName})`}.
                You can still create this contact if needed.
              </AlertDescription>
            </Alert>
          )}

          {/* Contact Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactType">Contact Type *</Label>
              <Select
                value={watchContactType}
                onValueChange={(value) => setValue('contactType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Contact Category</Label>
              <div className="flex items-center gap-4 h-10">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    {...register('isPerson')}
                    value="true"
                    checked={watch('isPerson') === true}
                    onChange={() => setValue('isPerson', true)}
                    className="text-blue-600"
                  />
                  <User className="h-4 w-4" />
                  <span>Person</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    {...register('isPerson')}
                    value="false"
                    checked={watch('isPerson') === false}
                    onChange={() => setValue('isPerson', false)}
                    className="text-blue-600"
                  />
                  <Building2 className="h-4 w-4" />
                  <span>Company</span>
                </label>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {watch('isPerson') ? 'Full Name' : 'Company Name'} *
              </Label>
              <Input
                id="name"
                {...register('name', { required: 'Name is required' })}
                placeholder={watch('isPerson') ? 'John Smith' : 'ABC Company'}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            {watch('isPerson') && (
              <div className="space-y-2">
                <Label htmlFor="companyName">Company</Label>
                <Input
                  id="companyName"
                  {...register('companyName')}
                  placeholder="Company name"
                />
              </div>
            )}

            {watch('isPerson') && (
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  {...register('title')}
                  placeholder="e.g., Managing Director"
                />
              </div>
            )}
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-gray-700">Contact Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email', {
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Invalid email address'
                    }
                  })}
                  placeholder="email@example.com"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  Phone
                </Label>
                <Input
                  id="phone"
                  {...register('phone')}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneAlt">Alt. Phone</Label>
                <Input
                  id="phoneAlt"
                  {...register('phoneAlt')}
                  placeholder="(555) 987-6543"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Website
                </Label>
                <Input
                  id="website"
                  {...register('website')}
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>

          {/* Type-specific fields */}
          {typeSpecificFields.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-gray-700">
                {CONTACT_TYPES.find(t => t.value === selectedType)?.label} Details
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {typeSpecificFields.map(field => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`typeFields.${field.key}`}>
                      {field.label}
                    </Label>
                    <Input
                      id={`typeFields.${field.key}`}
                      type={field.type === 'number' ? 'number' : 'text'}
                      {...register(`typeFields.${field.key}`)}
                      placeholder={field.placeholder || ''}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Any additional notes about this contact..."
              rows={3}
            />
          </div>

          {/* Org Preferred Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <Label htmlFor="isOrgPreferred" className="font-medium">
                Organization Preferred Vendor
              </Label>
              <p className="text-sm text-gray-500">
                Mark this contact as a preferred vendor for your organization
              </p>
            </div>
            <Switch
              id="isOrgPreferred"
              checked={watch('isOrgPreferred')}
              onCheckedChange={(checked) => setValue('isOrgPreferred', checked)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddContactModal;
