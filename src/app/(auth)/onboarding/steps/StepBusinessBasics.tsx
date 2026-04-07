'use client';

import { Label, TextInput, Select } from './ui';

const INDUSTRIES = [
  'Restaurant',
  'Retail',
  'Fitness',
  'Real Estate',
  'Dental',
  'Home Services',
  'Professional Services',
  'E-commerce',
  'Other',
];

interface Props {
  data: {
    businessName: string;
    industry: string;
    websiteUrl: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  onChange: (field: string, value: string) => void;
}

export default function StepBusinessBasics({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="businessName">Business name *</Label>
        <TextInput
          id="businessName"
          value={data.businessName}
          onChange={(v) => onChange('businessName', v)}
          placeholder="e.g. Sunrise Bakery"
          required
        />
      </div>

      <div>
        <Label htmlFor="industry">Industry</Label>
        <Select
          id="industry"
          value={data.industry}
          onChange={(v) => onChange('industry', v)}
          options={INDUSTRIES}
          placeholder="Select your industry"
        />
      </div>

      <div>
        <Label htmlFor="websiteUrl">Website URL</Label>
        <TextInput
          id="websiteUrl"
          value={data.websiteUrl}
          onChange={(v) => onChange('websiteUrl', v)}
          placeholder="https://example.com"
          type="url"
        />
      </div>

      <div>
        <Label htmlFor="phone">Phone number</Label>
        <TextInput
          id="phone"
          value={data.phone}
          onChange={(v) => onChange('phone', v)}
          placeholder="(555) 123-4567"
          type="tel"
        />
      </div>

      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider pt-2">
        Primary location
      </p>

      <div>
        <Label htmlFor="address">Address</Label>
        <TextInput
          id="address"
          value={data.address}
          onChange={(v) => onChange('address', v)}
          placeholder="123 Main St"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <TextInput
            id="city"
            value={data.city}
            onChange={(v) => onChange('city', v)}
            placeholder="City"
          />
        </div>
        <div>
          <Label htmlFor="state">State</Label>
          <TextInput
            id="state"
            value={data.state}
            onChange={(v) => onChange('state', v)}
            placeholder="CA"
          />
        </div>
      </div>

      <div className="w-1/2">
        <Label htmlFor="zip">Zip code</Label>
        <TextInput
          id="zip"
          value={data.zip}
          onChange={(v) => onChange('zip', v)}
          placeholder="90210"
        />
      </div>
    </div>
  );
}
