import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import {
  Building2,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Check,
  Building,
  Briefcase
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ROLES = [
  { value: 'GP', label: 'GP (General Partner)', description: 'Full deal management access - buy or sell properties' },
  { value: 'GP Analyst', label: 'GP Analyst', description: 'Deal analysis and review' },
  { value: 'Broker', label: 'Broker', description: 'Licensed real estate broker - list and market properties' },
  { value: 'Lender', label: 'Lender', description: 'Loan review and approval' },
  { value: 'Counsel', label: 'Counsel', description: 'Legal review' },
  { value: 'LP', label: 'LP (Limited Partner)', description: 'Investment monitoring' },
  { value: 'Auditor', label: 'Auditor', description: 'Compliance and audit' },
  { value: 'Regulator', label: 'Regulator', description: 'Regulatory oversight' },
];

// US states for broker license
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

export default function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organizationId: '',
    organizationName: '',
    role: 'GP Analyst',
    // Broker-specific fields
    brokerLicenseNo: '',
    brokerLicenseState: '',
    brokerageName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [isNewOrg, setIsNewOrg] = useState(false);

  useEffect(() => {
    async function fetchOrganizations() {
      try {
        const response = await fetch('/api/organizations/public');
        const data = await response.json();
        if (response.ok && data.organizations) {
          setOrganizations(data.organizations);
        }
      } catch (err) {
        console.error('Failed to fetch organizations:', err);
      }
    }
    fetchOrganizations();
  }, []);

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  function validatePassword(password) {
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
    };
    return checks;
  }

  const passwordChecks = validatePassword(formData.password);
  const allPasswordChecksPass = Object.values(passwordChecks).every(Boolean);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    if (!allPasswordChecksPass) {
      setError('Password does not meet requirements');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!formData.organizationId && !formData.organizationName.trim()) {
      setError('Please select an organization or create a new one');
      return;
    }

    // Broker-specific validation
    if (formData.role === 'Broker') {
      if (!formData.brokerLicenseNo.trim()) {
        setError('License number is required for brokers');
        return;
      }
      if (!formData.brokerLicenseState) {
        setError('License state is required for brokers');
        return;
      }
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          organizationId: isNewOrg ? null : formData.organizationId,
          organizationName: isNewOrg ? formData.organizationName : null,
          role: formData.role,
          // Broker-specific fields (only sent if role is Broker)
          ...(formData.role === 'Broker' && {
            brokerLicenseNo: formData.brokerLicenseNo,
            brokerLicenseState: formData.brokerLicenseState,
            brokerageName: formData.brokerageName || null
          })
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Signup failed');
      }

      // Store token and user
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      // Check if user needs verification
      if (data.requiresVerification) {
        navigate(createPageUrl('PendingVerification'));
      } else {
        login(data.user, data.token);
        navigate(createPageUrl('Home'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Canonical Deal OS</h1>
          <p className="text-slate-600 mt-1">Create your account</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Get started</CardTitle>
            <CardDescription>
              Enter your information to create an account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Smith"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="pl-10"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {/* Organization */}
              <div className="space-y-2">
                <Label>Organization</Label>
                <div className="flex gap-2 mb-2">
                  <Button
                    type="button"
                    variant={!isNewOrg ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsNewOrg(false)}
                    className={cn(!isNewOrg && 'bg-blue-600 hover:bg-blue-700')}
                  >
                    Existing
                  </Button>
                  <Button
                    type="button"
                    variant={isNewOrg ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsNewOrg(true)}
                    className={cn(isNewOrg && 'bg-blue-600 hover:bg-blue-700')}
                  >
                    New Organization
                  </Button>
                </div>

                {isNewOrg ? (
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Enter organization name"
                      value={formData.organizationName}
                      onChange={(e) => handleChange('organizationName', e.target.value)}
                      className="pl-10"
                    />
                  </div>
                ) : (
                  <Select
                    value={formData.organizationId}
                    onValueChange={(value) => handleChange('organizationId', value)}
                  >
                    <SelectTrigger>
                      <Building className="mr-2 h-4 w-4 text-slate-400" />
                      <SelectValue placeholder="Select your organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map(org => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                      {organizations.length === 0 && (
                        <SelectItem value="_none" disabled>
                          No organizations available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => handleChange('role', value)}
                >
                  <SelectTrigger>
                    <Briefcase className="mr-2 h-4 w-4 text-slate-400" />
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {ROLES.find(r => r.value === formData.role)?.description}
                </p>
              </div>

              {/* Broker License Fields - only shown when Broker role selected */}
              {formData.role === 'Broker' && (
                <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm font-medium text-blue-800">Broker License Information</p>

                  {/* License Number */}
                  <div className="space-y-2">
                    <Label htmlFor="brokerLicenseNo">License Number *</Label>
                    <Input
                      id="brokerLicenseNo"
                      type="text"
                      placeholder="e.g., 01234567"
                      value={formData.brokerLicenseNo}
                      onChange={(e) => handleChange('brokerLicenseNo', e.target.value)}
                    />
                  </div>

                  {/* License State */}
                  <div className="space-y-2">
                    <Label>License State *</Label>
                    <Select
                      value={formData.brokerLicenseState}
                      onValueChange={(value) => handleChange('brokerLicenseState', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(state => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Brokerage Firm (optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="brokerageName">Brokerage Firm (optional)</Label>
                    <Input
                      id="brokerageName"
                      type="text"
                      placeholder="e.g., CBRE, JLL, Cushman & Wakefield"
                      value={formData.brokerageName}
                      onChange={(e) => handleChange('brokerageName', e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      If your firm is already on the platform, you can join after signup.
                    </p>
                  </div>
                </div>
              )}

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password requirements */}
                {formData.password && (
                  <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                    <div className={cn('flex items-center gap-1', passwordChecks.length ? 'text-green-600' : 'text-slate-400')}>
                      <Check className="h-3 w-3" /> 8+ characters
                    </div>
                    <div className={cn('flex items-center gap-1', passwordChecks.uppercase ? 'text-green-600' : 'text-slate-400')}>
                      <Check className="h-3 w-3" /> Uppercase letter
                    </div>
                    <div className={cn('flex items-center gap-1', passwordChecks.lowercase ? 'text-green-600' : 'text-slate-400')}>
                      <Check className="h-3 w-3" /> Lowercase letter
                    </div>
                    <div className={cn('flex items-center gap-1', passwordChecks.number ? 'text-green-600' : 'text-slate-400')}>
                      <Check className="h-3 w-3" /> Number
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-slate-600 mt-4">
              Already have an account?{' '}
              <Link
                to={createPageUrl('Login')}
                className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-6">
          By creating an account, you agree to our{' '}
          <Link to="#" className="hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link to="#" className="hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
